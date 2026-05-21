function tests = test_smoke()
% TEST_SMOKE  Minimal sanity tests for the MATLAB integration.
%
%   From the repo root, run:
%       results = runtests('MATLAB/tests/test_smoke.m');

    tests = functiontests(localfunctions);
end

function setupOnce(testCase)
    addpath(genpath(fullfile(pwd, 'MATLAB')));
    testCase.TestData.cfg = nano.loadConfig();
    testCase.TestData.cfg.dryRun  = true;
    testCase.TestData.cfg.verbose = false;
end

function test_config_loads(testCase)
    cfg = testCase.TestData.cfg;
    verifyTrue(testCase, isstruct(cfg), 'cfg should be a struct');
    verifyTrue(testCase, isfield(cfg, 'outDir'), 'cfg.outDir missing');
    verifyTrue(testCase, isfield(cfg, 'salt'), 'cfg.salt missing');
end

function test_hrv_returns_info(testCase)
    info = export_hrv_features(testCase.TestData.cfg);
    verifyEqual(testCase, info.feature, 'hrv');
    verifyGreaterThan(testCase, info.rows, 0);
end

function test_temp_returns_info(testCase)
    info = export_temperature_features(testCase.TestData.cfg);
    verifyEqual(testCase, info.feature, 'temp');
    verifyGreaterThan(testCase, info.rows, 0);
end

function test_hda_returns_info(testCase)
    info = export_hda_phases(testCase.TestData.cfg);
    verifyEqual(testCase, info.feature, 'hda');
    verifyGreaterThan(testCase, info.rows, 0);
end

function test_manifest_written(testCase)
    cfg = testCase.TestData.cfg;
    cfg.dryRun = false;
    infoHrv  = export_hrv_features(cfg);
    infoTemp = export_temperature_features(cfg);
    infoHda  = export_hda_phases(cfg);
    p = nano.writeDashboardManifest(cfg, {infoHrv, infoTemp, infoHda});
    verifyTrue(testCase, exist(p, 'file') == 2, 'manifest.json not written');
end
