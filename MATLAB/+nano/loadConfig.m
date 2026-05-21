function cfg = loadConfig()
% NANO.LOADCONFIG  Resolve the local nano_config or fall back to the example.
%   cfg = nano.loadConfig()
%
%   Looks for MATLAB/config/nano_config.m first. If missing (fresh clone)
%   it falls back to nano_config.example.m so smoke tests still work.

    here = fileparts(mfilename('fullpath'));
    repoRoot = fileparts(here);
    cfgDir = fullfile(repoRoot, 'config');

    if exist(fullfile(cfgDir, 'nano_config.m'), 'file') == 2
        addpath(cfgDir);
        cfg = nano_config();
        cfg.source = 'local';
    else
        warning('nano:loadConfig:fallback', ...
            'nano_config.m not found, falling back to nano_config.example.m. Copy and edit before any real run.');
        addpath(cfgDir);
        cfg = nano_config();
        cfg.source = 'example';
    end

    if ~exist(cfg.outDir, 'dir')
        mkdir(cfg.outDir);
    end

    if ~exist(fileparts(cfg.logFile), 'dir')
        mkdir(fileparts(cfg.logFile));
    end
end
