% SYNTHETIC_DEMO  Round-trip the MATLAB integration with no real data.
%
%   Use this to confirm a fresh clone works end-to-end before the secure
%   mount is attached. It runs every export against the synthetic fallback
%   path, writes Parquet to data/interim/matlab/, and emits the manifest.

cfg = nano.loadConfig();
cfg.dryRun = false;
cfg.verbose = true;

infoHrv  = export_hrv_features(cfg);
infoTemp = export_temperature_features(cfg);
infoHda  = export_hda_phases(cfg);

nano.writeDashboardManifest(cfg, {infoHrv, infoTemp, infoHda});

fprintf('Demo complete. Check %s\n', cfg.outDir);
