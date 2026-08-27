from __future__ import annotations

from dashboard.server import data_features

PUBMED_XML = """<?xml version="1.0"?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>12345</PMID>
      <Article>
        <Journal>
          <Title>Developmental Psychobiology</Title>
          <JournalIssue>
            <Volume>67</Volume>
            <Issue>2</Issue>
            <PubDate><Year>2026</Year><Month>Feb</Month></PubDate>
          </JournalIssue>
        </Journal>
        <ArticleTitle>Heart rate variability in very preterm infants</ArticleTitle>
        <Pagination><MedlinePgn>44-59</MedlinePgn></Pagination>
        <Abstract><AbstractText>Preterm infant RSA and RMSSD during NICU follow-up.</AbstractText></Abstract>
        <AuthorList>
          <Author>
            <LastName>Bradshaw</LastName>
            <ForeName>Jessica</ForeName>
            <Initials>J</Initials>
            <AffiliationInfo><Affiliation>University of South Carolina</Affiliation></AffiliationInfo>
          </Author>
        </AuthorList>
        <PublicationTypeList><PublicationType>Journal Article</PublicationType></PublicationTypeList>
      </Article>
      <MeshHeadingList>
        <MeshHeading><DescriptorName>Infant, Premature</DescriptorName></MeshHeading>
      </MeshHeadingList>
      <KeywordList><Keyword>respiratory sinus arrhythmia</Keyword></KeywordList>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList><ArticleId IdType="doi">10.1002/dev.88888</ArticleId></ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>
"""


def test_parse_pubmed_xml_and_assign_tags():
    records = data_features.parse_pubmed_xml(PUBMED_XML)

    assert records[0]["pmid"] == "12345"
    assert records[0]["doi"] == "10.1002/dev.88888"
    assert records[0]["authors"][0]["last"] == "Bradshaw"
    assert {"preterm", "hrv-rsa"}.issubset(data_features.auto_tags(records[0]))


def test_publication_upsert_is_idempotent(tmp_path):
    db_path = tmp_path / "features.sqlite3"
    data_features.ensure_feature_db(db_path)
    record = data_features.parse_pubmed_xml(PUBMED_XML)[0]

    with data_features._connect(db_path) as conn:
        first = data_features.upsert_publication(conn, record)
        second = data_features.upsert_publication(conn, record)

    assert first == 1
    assert second == 0
    assert data_features.list_publications({}, db_path)["total"] == 3


def test_orcid_merge_deduplicates_by_doi():
    pubmed = data_features.parse_pubmed_xml(PUBMED_XML)
    orcid = data_features.parse_orcid_works(
        {
            "group": [
                {
                    "work-summary": [
                        {
                            "title": {"title": {"value": "Duplicate"}},
                            "journal-title": {"value": "Journal"},
                            "publication-date": {"year": {"value": "2026"}},
                            "external-ids": {
                                "external-id": [
                                    {
                                        "external-id-type": "doi",
                                        "external-id-value": "10.1002/dev.88888",
                                    }
                                ]
                            },
                        },
                        {
                            "title": {"title": {"value": "Book chapter"}},
                            "journal-title": {"value": "Book"},
                            "publication-date": {"year": {"value": "2025"}},
                            "external-ids": {
                                "external-id": [
                                    {
                                        "external-id-type": "doi",
                                        "external-id-value": "10.1/book",
                                    }
                                ]
                            },
                            "type": "book-chapter",
                        },
                    ]
                }
            ]
        }
    )

    merged = data_features.merge_pubmed_orcid(pubmed, orcid)

    assert len(merged) == 2
    assert merged[-1]["source"] == "orcid"


def test_sync_publications_merges_orcid_and_crossref(tmp_path):
    db_path = tmp_path / "features.sqlite3"

    def fake_json(url: str, headers: dict[str, str] | None):
        if "esearch.fcgi" in url:
            return {"esearchresult": {"idlist": ["12345"]}}
        if "pub.orcid.org" in url:
            assert headers == {"Accept": "application/json"}
            return {
                "group": [
                    {
                        "work-summary": [
                            {
                                "title": {
                                    "title": {"value": "ORCID-only book chapter"}
                                },
                                "journal-title": {"value": "Developmental Cascades"},
                                "publication-date": {"year": {"value": "2025"}},
                                "external-ids": {
                                    "external-id": [
                                        {
                                            "external-id-type": "doi",
                                            "external-id-value": "10.1234/orcid.chapter",
                                        }
                                    ]
                                },
                                "type": "book-chapter",
                            }
                        ]
                    }
                ]
            }
        if "api.crossref.org" in url:
            assert headers and headers["User-Agent"].startswith("ESD-Lab-Dashboard/1.0")
            return {
                "message": {
                    "is-referenced-by-count": 7,
                    "subject": ["Developmental Psychology"],
                    "type": "journal-article",
                }
            }
        raise AssertionError(f"unexpected json url: {url}")

    def fake_text(url: str, headers: dict[str, str] | None):
        assert "efetch.fcgi" in url
        return PUBMED_XML

    status = data_features.sync_publications(
        db_path,
        allow_network=True,
        fetch_json=fake_json,
        fetch_text=fake_text,
    )
    pubmed_record = data_features.get_publication("12345", db_path)
    orcid_record = data_features.get_publication("10.1234/orcid.chapter", db_path)

    assert status["inserted"] == 2
    assert pubmed_record is not None
    assert pubmed_record["citation_count"] == 7
    assert pubmed_record["pub_type"] == "journal-article"
    assert "Developmental Psychology" in pubmed_record["keywords"]
    assert orcid_record is not None
    assert orcid_record["source"] == "orcid"
