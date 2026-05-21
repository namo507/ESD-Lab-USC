function auditLog(cfg, action, scope, note)
% NANO.AUDITLOG  Append a structured row to logs/matlab_runs.csv.
%   nano.auditLog(cfg, action, scope, note)

    if nargin < 4, note = ''; end

    row = table( ...
        string(datestr(datetime('now', 'TimeZone', 'UTC'), 'yyyy-mm-ddTHH:MM:SSZ')), ...
        string(getenv('USER')), ...
        string(action), ...
        string(scope), ...
        string(note), ...
        'VariableNames', {'ts','user','action','scope','note'});

    if exist(cfg.logFile, 'file') == 2
        writetable(row, cfg.logFile, 'WriteMode', 'append', 'WriteVariableNames', false);
    else
        writetable(row, cfg.logFile);
    end
end
