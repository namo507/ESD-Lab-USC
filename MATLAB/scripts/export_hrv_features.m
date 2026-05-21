function info = export_hrv_features(cfg)
% EXPORT_HRV_FEATURES  ECG → IBI → HRV features → Parquet for the dashboard.
%   info = export_hrv_features(cfg)
%
%   Reads cleaned ECG segments from the secure mount, computes time-domain
%   and frequency-domain HRV features per epoch, applies window QA, and
%   writes one Parquet file the Python merge picks up.

    if nargin < 1, cfg = nano.loadConfig(); end

    if cfg.verbose, fprintf('[hrv] starting export, epoch=%d s\n', cfg.epochSec); end

    % Discover cleaned ECG segments. In the demo path the secure mount is
    % absent so the script falls back to a synthetic IBI generator that
    % matches the schema the production code emits.
    ecgDir = fullfile(cfg.dataRoot, 'interim', 'ecg_clean');
    if exist(ecgDir, 'dir')
        files = dir(fullfile(ecgDir, '*.mat'));
        T = i_realPath(files, cfg);
    else
        warning('nano:hrv:fallback', 'Secure mount missing, using synthetic HRV demo.');
        T = i_syntheticPath(cfg);
    end

    % Window QA filter
    T = T(T.qa_score >= cfg.minQaScore, :);
    T.qa_flag = i_qaFlag(T.qa_score);

    % Drop the raw QA score before write (only flag travels downstream)
    T.qa_score = [];

    outFile = fullfile(cfg.outDir, 'hrv_dense.parquet');
    if ~cfg.dryRun
        parquetwrite(outFile, T);
    end

    nano.auditLog(cfg, 'matlab.export', 'hrv', sprintf('rows=%d', height(T)));
    info = struct('name', 'hrv_dense.parquet', 'rows', height(T), ...
                  'feature', 'hrv', 'qaPassPct', mean(T.qa_flag ~= "reject"));

    if cfg.verbose
        fprintf('[hrv] wrote %d epochs -> %s\n', height(T), outFile);
    end
end

% ─── helpers ───────────────────────────────────────────────────────────────

function T = i_realPath(files, cfg)
    rows = {};
    for k = 1:numel(files)
        S = load(fullfile(files(k).folder, files(k).name));
        ibis = S.ibi_ms / 1000;                  % seconds
        nWin = floor(numel(ibis) / cfg.epochSec);
        for w = 1:nWin
            seg = ibis((w-1)*cfg.epochSec + 1 : w*cfg.epochSec);
            row = struct();
            row.study_id    = string(S.study_id);
            row.event       = string(S.event);
            row.epoch_start = datetime(S.t0, 'ConvertFrom', 'posixtime', 'TimeZone', 'UTC') + seconds((w-1)*cfg.epochSec);
            row.epoch_sec   = int32(cfg.epochSec);
            row.rmssd       = sqrt(mean(diff(seg).^2)) * 1000;
            row.sdnn        = std(seg) * 1000;
            row.pnn50       = mean(abs(diff(seg)) > 0.050) * 100;
            row.lf_hf       = i_lfhf(seg);
            row.qa_score    = max(0, 1 - sum(isnan(seg)) / numel(seg));
            rows{end+1} = row;  %#ok<AGROW>
        end
    end
    T = struct2table([rows{:}]);
end

function T = i_syntheticPath(cfg)
    rng(42);
    ids = compose("NANO-%04d", [12 34 73 88 102 137 174]);
    events = ["month_1_arm_1", "month_3_arm_1", "month_6_arm_1", "month_12_arm_1"];
    rows = {};
    t0 = datetime(2026, 5, 1, 'TimeZone', 'UTC');
    for i = 1:numel(ids)
        for e = 1:numel(events)
            for w = 1:6
                row = struct();
                row.study_id    = ids(i);
                row.event       = events(e);
                row.epoch_start = t0 + days(7*(i-1) + e) + minutes((w-1)*cfg.epochSec/60);
                row.epoch_sec   = int32(cfg.epochSec);
                row.rmssd       = 32 + 8*randn();
                row.sdnn        = 48 + 10*randn();
                row.pnn50       = max(0, 6 + 3*randn());
                row.lf_hf       = max(0.2, 1.6 + 0.4*randn());
                row.qa_score    = min(1, max(0.5, 0.85 + 0.1*randn()));
                rows{end+1} = row; %#ok<AGROW>
            end
        end
    end
    T = struct2table([rows{:}]);
end

function r = i_lfhf(seg)
    % Crude LF/HF stand-in: ratio of low to high freq power on the IBI series
    if numel(seg) < 32, r = NaN; return; end
    [pxx, f] = periodogram(seg - mean(seg), [], [], 1/median(seg));
    lf = sum(pxx(f >= 0.04 & f < 0.15));
    hf = sum(pxx(f >= 0.15 & f < 0.40));
    r = lf / max(hf, eps);
end

function flags = i_qaFlag(scores)
    flags = repmat("good", size(scores));
    flags(scores >= 0.90) = "excellent";
    flags(scores < 0.80)  = "marginal";
    flags(scores < 0.70)  = "reject";
end
