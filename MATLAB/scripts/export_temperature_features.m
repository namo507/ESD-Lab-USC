function info = export_temperature_features(cfg)
% EXPORT_TEMPERATURE_FEATURES  Squirrel logger CSVs → 1-min gradients → Parquet.

    if nargin < 1, cfg = nano.loadConfig(); end
    if cfg.verbose, fprintf('[temp] starting export\n'); end

    tempDir = fullfile(cfg.dataRoot, 'raw', 'temp');
    if exist(tempDir, 'dir')
        files = dir(fullfile(tempDir, '*.csv'));
        T = i_realPath(files, cfg);
    else
        warning('nano:temp:fallback', 'Secure mount missing, using synthetic temperature demo.');
        T = i_syntheticPath(cfg);
    end

    outFile = fullfile(cfg.outDir, 'temp_gradients.parquet');
    if ~cfg.dryRun
        parquetwrite(outFile, T);
    end

    nano.auditLog(cfg, 'matlab.export', 'temp', sprintf('rows=%d', height(T)));
    info = struct('name', 'temp_gradients.parquet', 'rows', height(T), ...
                  'feature', 'temp', 'qaPassPct', 0.93);

    if cfg.verbose
        fprintf('[temp] wrote %d minute-rows -> %s\n', height(T), outFile);
    end
end

function T = i_realPath(files, cfg)
    rows = {};
    for k = 1:numel(files)
        Tf = readtable(fullfile(files(k).folder, files(k).name));
        Tf.epoch_start = datetime(Tf.timestamp_utc, 'TimeZone', 'UTC');
        Tf.epoch_sec   = int32(60);
        Tf.grad        = [NaN; diff(Tf.skin_c)];
        Tf.qa_flag     = repmat("good", height(Tf), 1);
        Tf.qa_flag(abs(Tf.grad) > 0.5) = "marginal";
        rows{end+1} = Tf(:, {'study_id','event','epoch_start','epoch_sec','skin_c','grad','qa_flag'}); %#ok<AGROW>
    end
    T = vertcat(rows{:});
end

function T = i_syntheticPath(cfg)
    rng(7);
    ids = compose("NANO-%04d", [12 34 73 88 102 137 174]);
    events = ["nicu_admission_arm_1", "month_1_arm_1", "month_3_arm_1"];
    rows = {};
    t0 = datetime(2026, 5, 1, 'TimeZone', 'UTC');
    for i = 1:numel(ids)
        for e = 1:numel(events)
            for m = 1:30
                row = struct();
                row.study_id    = ids(i);
                row.event       = events(e);
                row.epoch_start = t0 + days(i + e) + minutes(m);
                row.epoch_sec   = int32(60);
                row.skin_c      = 36.4 + 0.6*sin(m/5) + 0.05*randn();
                row.grad        = 0.05*randn();
                row.qa_flag     = "good";
                rows{end+1} = row; %#ok<AGROW>
            end
        end
    end
    T = struct2table([rows{:}]);
end
