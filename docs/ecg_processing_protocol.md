# ECG Processing Standard Operating Procedure

## 1. Recording Protocol

### 1.1 Electrode Placement
- Use a 3-lead configuration: Right Arm (RA), Left Arm (LA), Left Leg (LL).
- Clean electrode sites with isopropyl alcohol; allow to dry before applying disposable Ag/AgCl electrodes.
- Confirm signal quality: baseline noise < 0.05 mV, no 60 Hz interference.

### 1.2 Five-Minute Quiet Alert Period
- Seat participant in a comfortable, upright position.
- Ask participant to remain still and avoid talking.
- Record a minimum 5-minute baseline ECG prior to the HDA task.
- Document any movement artifacts in the session notes field in REDCap (`ecg_notes`).

---

## 2. Filter Specifications

All raw ECG signals are filtered with a **4th-order zero-phase Butterworth bandpass filter**:

| Parameter | Value |
|-----------|-------|
| Filter type | Butterworth, zero-phase (forward-backward) |
| Order | 4 |
| Low cutoff | 0.5 Hz |
| High cutoff | 40 Hz |
| Implementation | `scipy.signal.butter` + `sosfiltfilt` |

```python
from scipy.signal import butter, sosfiltfilt

def bandpass_filter(signal, fs=1000, lowcut=0.5, highcut=40, order=4):
    nyq = fs / 2
    sos = butter(order, [lowcut / nyq, highcut / nyq], btype='band', output='sos')
    return sosfiltfilt(sos, signal)
```

---

## 3. R-Peak Detection

R-peaks are detected using the **Pan-Tompkins algorithm** via the `neurokit2` library:

```python
import neurokit2 as nk

signals, info = nk.ecg_process(ecg_signal, sampling_rate=1000, method='pantompkins1985')
r_peaks = info['ECG_R_Peaks']
```

Inter-beat intervals (IBI) are derived as the differences between consecutive R-peak sample indices, converted to milliseconds.

---

## 4. Artifact Rejection

### 4.1 Statistical Outlier Rejection
- Compute a rolling mean and SD over a ±30-beat window.
- Flag any IBI where `|IBI - local_mean| > 3.5 × local_SD`.

### 4.2 Ectopic Beat Removal
- Flag beats where successive difference > 20% of the prior IBI (likely ectopic).
- Remove flagged beats and interpolate linearly if gap ≤ 3 beats; otherwise mark as missing.

### 4.3 Movement Artifact
- Segments with accelerometer magnitude > 2g (if available) are automatically excluded.
- Visually flagged segments marked in `ecg_artifact_flag` REDCap field.

---

## 5. HDA Phase Definition

| Phase | Label | Definition | Typical Duration |
|-------|-------|------------|-----------------|
| 1 | `orienting` | Onset of stimulus to 10 s post-onset | 10 s |
| 2 | `sustained_attention` | 10 s post-onset to offset − 10 s | Variable |
| 3 | `termination` | Final 10 s of stimulus presentation | 10 s |
| 4 | `inattention` | Inter-trial baseline / off-task periods | Variable |

Phase boundaries are defined by event markers in the stimulus presentation log merged with ECG timestamps.

---

## 6. Window Rejection Criteria

A data window is marked **invalid** if either condition is met:

| Criterion | Threshold | Action |
|-----------|-----------|--------|
| Contiguous missing beats | > 5 consecutive beats | Reject window |
| Proportion missing beats | > 10% of beats in window | Reject window |

---

## 7. QA Thresholds

| Valid Beat % | QA Category | Action |
|-------------|-------------|--------|
| < 70% | Rejected | Exclude from analysis |
| 70–80% | Marginal | Flag; use with caution; note in analysis log |
| 80–90% | Good | Include; note marginal windows |
| > 90% | Excellent | Include without restriction |

QA scores are stored in REDCap field `ecg_qa_score` as a percentage.

---

## 8. Output Files

Processed HRV features are exported to `data/processed/hrv_features.csv` with columns:
`record_id`, `redcap_event_name`, `phase`, `rmssd`, `sdnn`, `mean_ibi`, `pnn50`, `qa_score`, `n_beats_valid`, `n_beats_total`.
