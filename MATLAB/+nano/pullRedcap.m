function T = pullRedcap(cfg, opts)
% NANO.PULLREDCAP  Thin REDCap export wrapper using webread.
%   T = nano.pullRedcap(cfg, opts)
%   opts.events  cell array of REDCap event names (optional)
%   opts.fields  cell array of REDCap fields (optional)
%   opts.format  'csv' (default) | 'json'
%
%   Returns a MATLAB table. Token + URL come from cfg.redcap.

    arguments
        cfg
        opts.events {mustBeCellstr} = {}
        opts.fields {mustBeCellstr} = {}
        opts.format (1,1) string {mustBeMember(opts.format, ["csv","json"])} = "csv"
    end

    if isempty(cfg.redcap.token) || isempty(cfg.redcap.url)
        error('nano:redcap:noToken', ...
            'REDCAP_API_TOKEN or REDCAP_API_URL not set in environment. Source ~/.env or export them.');
    end

    body = struct();
    body.token   = cfg.redcap.token;
    body.content = 'record';
    body.format  = char(opts.format);
    body.type    = 'flat';
    body.rawOrLabel = 'raw';
    body.exportSurveyFields = 'false';

    if ~isempty(opts.events)
        for i = 1:numel(opts.events)
            body.(sprintf('events[%d]', i-1)) = opts.events{i};
        end
    end
    if ~isempty(opts.fields)
        for i = 1:numel(opts.fields)
            body.(sprintf('fields[%d]', i-1)) = opts.fields{i};
        end
    end

    options = weboptions('MediaType', 'application/x-www-form-urlencoded', 'Timeout', 120);
    raw = webwrite(cfg.redcap.url, body, options);

    if opts.format == "csv"
        tmp = [tempname '.csv'];
        fid = fopen(tmp, 'w');
        fwrite(fid, raw);
        fclose(fid);
        T = readtable(tmp);
        delete(tmp);
    else
        T = struct2table(jsondecode(raw));
    end

    if cfg.verbose
        fprintf('[nano] pulled %d REDCap rows\n', height(T));
    end
end

function mustBeCellstr(x)
    if ~iscell(x) || ~all(cellfun(@ischar, x))
        error('Argument must be a cell array of char vectors.');
    end
end
