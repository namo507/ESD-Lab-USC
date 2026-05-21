% RUN_ALL  Master MATLAB run: HRV + Temp + HDA, then write the manifest.
%
%   Loads config, runs every export, then writes the manifest the Python
%   merge picks up via dashboard/pipelines/build_dashboard_data.py.

cfg = nano.loadConfig();

if cfg.verbose
    fprintf('========================================\n');
    fprintf(' NANO MATLAB export · %s\n', datestr(now));
    fprintf('========================================\n');
end

infoHrv  = export_hrv_features(cfg);
infoTemp = export_temperature_features(cfg);
infoHda  = export_hda_phases(cfg);

manifestPath = nano.writeDashboardManifest(cfg, {infoHrv, infoTemp, infoHda});

if cfg.verbose
    fprintf('========================================\n');
    fprintf(' Done. Manifest at %s\n', manifestPath);
    fprintf(' Run "make dashboard-refresh" to merge.\n');
    fprintf('========================================\n');
end
