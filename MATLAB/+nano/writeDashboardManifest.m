function manifestPath = writeDashboardManifest(cfg, files)
% NANO.WRITEDASHBOARDMANIFEST  Emit manifest.json the Python merge reads.
%   manifestPath = nano.writeDashboardManifest(cfg, files)
%
%   files is a cell array of struct with fields:
%       name      (string) file name written under cfg.outDir
%       rows      (int)    row count
%       feature   (string) feature family, e.g. 'hrv' | 'temp' | 'hda'
%       qaPassPct (double) fraction of epochs >= cfg.minQaScore

    if ~exist(cfg.outDir, 'dir'), mkdir(cfg.outDir); end

    manifest = struct();
    manifest.generated_at  = datestr(datetime('now', 'TimeZone', 'UTC'), 'yyyy-mm-ddTHH:MM:SSZ');
    manifest.matlab_version = version('-release');
    manifest.host          = char(java.net.InetAddress.getLocalHost.getHostName);
    manifest.salt          = cfg.salt;
    manifest.epoch_sec     = cfg.epochSec;
    manifest.dry_run       = cfg.dryRun;
    manifest.source        = cfg.source;
    manifest.files         = files;

    manifestPath = fullfile(cfg.outDir, 'manifest.json');
    fid = fopen(manifestPath, 'w');
    if fid == -1
        error('nano:manifest:io', 'Could not open %s for writing.', manifestPath);
    end
    fwrite(fid, jsonencode(manifest, 'PrettyPrint', true));
    fclose(fid);

    if cfg.verbose
        fprintf('[nano] wrote manifest -> %s\n', manifestPath);
    end
end
