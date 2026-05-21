function cfg = nano_config()
% NANO_CONFIG  Template configuration for the MATLAB integration.
%   Copy this file to MATLAB/config/nano_config.m and edit. The committed
%   copy stays an example so the real paths and secrets never enter git.
%
%   Loaded by nano.loadConfig.

    here          = fileparts(mfilename('fullpath'));
    cfg.repoRoot  = fileparts(fileparts(here));

    % USC Secure Server mount. Override per machine. Never store raw data inside repoRoot.
    cfg.dataRoot  = fullfile(filesep, 'Volumes', 'nano_secure');

    % Outputs the Python merge consumes
    cfg.outDir    = fullfile(cfg.repoRoot, 'data', 'interim', 'matlab');
    cfg.logFile   = fullfile(cfg.repoRoot, 'logs', 'matlab_runs.csv');

    % REDCap (read from env so secrets never live in source)
    cfg.redcap.token = getenv('REDCAP_API_TOKEN');
    cfg.redcap.url   = getenv('REDCAP_API_URL');

    % Pipeline knobs
    cfg.epochSec     = 60;            % HRV epoch length, seconds
    cfg.minQaScore   = 0.7;           % drop epochs below this window-QA score
    cfg.salt         = 'nano_demo';   % surrogate-id salt (matches config/paths.yml)

    % Friendly flags
    cfg.dryRun       = false;
    cfg.verbose      = true;
end
