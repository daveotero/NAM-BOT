import { useEffect, type JSX } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReportFact, TrainingReportData } from '../../shared/training-report'
import NamBotWordmark from '../components/NamBotWordmark'
import EsrHistoryChart from '../features/jobs/EsrHistoryChart'
import { getEsrSeriesColor } from '../features/jobs/esr-chart-data'
import { formatEsr, formatPackedSubmodelMetricLabel } from '../features/jobs/job-helpers'
import { formatLocalDateTime } from '../utils/date-time'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-800.css'
import '@fontsource/vt323/latin-400.css'
import '../styles/tokens.css'
import '../styles/global.css'
import './report.css'

function Facts({ facts }: { facts: ReportFact[] }): JSX.Element {
  return <dl className="report-facts">{facts.map(fact => <div key={fact.label}>
    <dt className="ui-text-secondary">{fact.label}</dt><dd>{fact.value}</dd>
  </div>)}</dl>
}

function TrainingReport({ data, image }: { data: TrainingReportData; image: boolean }): JSX.Element {
  const preset = data.facts.find(fact => fact.label === 'Preset')?.value ?? 'Unavailable'
  const architecture = data.facts.find(fact => fact.label === 'Architecture')?.value
  const summary = data.facts.filter(fact => !['Preset', 'Architecture'].includes(fact.label)).map(fact => ({
    ...fact, label: fact.label === 'Epochs · completed / planned' ? 'Epochs' : fact.label === 'Delay (samples)' ? 'Delay' : fact.label,
    value: fact.label === 'Delay (samples)' && fact.value !== 'Unavailable' ? `${fact.value} samples` : fact.value
  }))
  const statusClass = ['Failed', 'Stopped'].includes(data.status) ? 'error' : data.status === 'Training snapshot' ? 'running' : 'successful'
  useEffect(() => {
    void document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
      document.documentElement.dataset.reportReady = 'true'
    })))
  }, [])
  return <article className={`training-report${image ? ' report-image' : ''}`}>
    <header className="report-brand">
      <NamBotWordmark animated={!image} />
      <span className="runtime-detail-label">Training report</span>
    </header>
    <section className="job-card report-card">
      <div className="report-heading"><div><h1 className="ui-text-title">{data.modelName}</h1>
        {data.jobName !== data.modelName && <p>{data.jobName}</p>}
        <p className="ui-text-secondary">{data.modelFilename ?? 'No saved model associated with this report'}</p>
      </div><span className={`queue-status-badge ${statusClass}`}>{data.status}</span></div>
      <div className="report-summary">
        <section className="runtime-detail-column report-overview" aria-label="Training summary">
          <div className="runtime-detail-field">
            <h2 className="runtime-detail-label">Preset</h2>
            <div className="runtime-preset-value">
              {architecture && <span className="queue-status-badge queued">{architecture}</span>}
              <span>{preset}</span>
            </div>
          </div>
          <dl className="runtime-detail-facts report-summary-facts">{summary.map(fact => <div className="runtime-detail-fact" key={fact.label}>
            <dt className="runtime-detail-label" title={fact.label === 'Epochs' ? 'Completed / planned epochs' : undefined}>{fact.label}</dt>
            <dd className="runtime-detail-value">{fact.value}</dd>
          </div>)}</dl>
        </section>
        <section className="runtime-detail-column report-metrics" aria-label={data.savedModel ? 'Saved model ESR' : 'Best recorded ESR'}>
          <h2 className="runtime-detail-label">{data.savedModel ? 'Saved model ESR' : 'Best recorded ESR'}</h2>
          <table className="report-esr-table">
            {!image && <thead><tr><th scope="col">Submodel</th><th scope="col">ESR</th><th scope="col">Best epoch</th></tr></thead>}
            <tbody>{data.metrics.map(metric => <tr className="runtime-esr-item" key={metric.submodelIndex ?? 'model'}>
              <th scope="row" className="runtime-esr-label">{metric.submodelIndex == null ? 'Model' : formatPackedSubmodelMetricLabel({
                submodelIndex: metric.submodelIndex, submodelName: metric.submodelName
              }).replace(/\s+ESR$/, '')}</th>
              <td className="runtime-esr-value" style={{ color: getEsrSeriesColor(metric.submodelIndex ?? 0) }}>{formatEsr(metric.esr)}</td>
              {!image && <td className="ui-text-secondary report-best-epoch">{metric.epoch ?? 'Unavailable'}</td>}
            </tr>)}</tbody>
          </table>
          <p className="ui-text-secondary report-metrics-note">{data.savedModel ? 'Saved checkpoint values' : 'Available checkpoint values'} · lower is better</p>
        </section>
      </div>
      <EsrHistoryChart history={data.history} active={false} interactive={!image} responsive />
      <p className="ui-text-secondary report-caption">Recorded validation ESR by epoch · saved weights may come from different best epochs.</p>
    </section>
    {!image && <div className="report-details">
      <section className="runtime-detail-column"><h2 className="runtime-detail-label">{data.settingsResolved ? 'Training settings' : 'Preset settings'}</h2>
        <p className="ui-text-secondary report-caption">{data.settingsResolved
          ? 'Settings from the frozen training recipe, including expert overrides.'
          : 'Values from the frozen preset. Expert overrides can change the effective training configuration.'}</p>
        {data.settings.length ? <Facts facts={data.settings} /> : <p>Training recipe unavailable for this run.</p>}</section>
      <section className="runtime-detail-column"><h2 className="runtime-detail-label">Model & run details</h2>
        <Facts facts={[...data.metadata,
          { label: 'Started', value: formatLocalDateTime(data.startedAt) },
          { label: 'Finished', value: !data.finishedAt && data.status === 'Training snapshot' ? 'Not finished at export' : formatLocalDateTime(data.finishedAt) },
          { label: 'Report captured', value: formatLocalDateTime(data.generatedAt) },
          { label: 'NAM-BOT version', value: data.appVersion }
        ]} /></section>
    </div>}
    <footer className="report-footer">
      <p>Created with <strong>NAM-BOT</strong> — Neural Amp Modeler Training Manager</p>
      {image ? <p className="report-project-url">github.com/daveotero/nam-bot</p> : <nav aria-label="NAM-BOT project">
        <a href="https://github.com/daveotero/nam-bot" target="_blank" rel="noopener noreferrer">NAM-BOT GitHub ↗</a>
      </nav>}
    </footer>
  </article>
}

const payload = document.getElementById('training-report-data')
const root = document.getElementById('root')
if (payload && root) {
  // This payload is emitted exclusively by our typed, allowlisted report builder.
  const data: TrainingReportData = JSON.parse(payload.textContent ?? '{}')
  createRoot(root).render(<TrainingReport data={data} image={document.documentElement.dataset.reportFormat === 'png'} />)
}
