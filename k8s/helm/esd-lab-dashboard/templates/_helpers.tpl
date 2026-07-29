{{- define "esd-lab-dashboard.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "esd-lab-dashboard.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- include "esd-lab-dashboard.name" . -}}
{{- end -}}
{{- end -}}

{{- define "esd-lab-dashboard.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "esd-lab-dashboard.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "esd-lab-dashboard.labels" -}}
app.kubernetes.io/name: {{ include "esd-lab-dashboard.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "esd-lab-dashboard.image" -}}
{{ .Values.image.repository }}:{{ .Values.image.tag }}
{{- end -}}

{{- define "esd-lab-dashboard.requiredReadingsClaim" -}}
{{- required "existingClaims.readings is required; set it to the RWX PVC mounted at /app/esd-lab-readings." .Values.existingClaims.readings -}}
{{- end -}}

{{- define "esd-lab-dashboard.requiredDataClaim" -}}
{{- required "existingClaims.data is required; set it to the RWX PVC mounted at /app/dashboard/data." .Values.existingClaims.data -}}
{{- end -}}

{{- define "esd-lab-dashboard.ollamaFullname" -}}
{{- printf "%s-ollama" (include "esd-lab-dashboard.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "esd-lab-dashboard.assistantApiBase" -}}
{{- if .Values.assistant.apiBase -}}
{{- .Values.assistant.apiBase -}}
{{- else if .Values.ollama.enabled -}}
{{- printf "http://%s:%v/v1" (include "esd-lab-dashboard.ollamaFullname" .) .Values.ollama.service.port -}}
{{- else -}}
{{- fail "assistant.apiBase is required when ollama.enabled is false" -}}
{{- end -}}
{{- end -}}
