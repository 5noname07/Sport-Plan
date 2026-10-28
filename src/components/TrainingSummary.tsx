import type { CardioSession } from '../domain/types';
import { CARDIO_ACTIVITIES, cardioMetrics, formatPace } from '../domain/cardio';
import { format } from './shared';

export function CardioSummary({ session }: { session: CardioSession }) {
  const metrics = cardioMetrics(session);
  return (
    <div className="cardio-summary">
      <strong>{CARDIO_ACTIVITIES[session.activity].label}</strong>
      <span>
        {session.start_time?.slice(0, 5) ?? '未记录时间'} ·{' '}
        {session.duration_minutes !== null
          ? `${format(session.duration_minutes)} 分钟`
          : '时长未记录'}
        {session.distance_km !== null && ` · ${format(session.distance_km, 2)} km`}
      </span>
      {metrics && (
        <small>
          {session.activity === 'running' || session.activity === 'walking'
            ? `平均配速 ${formatPace(metrics.paceMinutesPerKm)} min/km`
            : `平均速度 ${format(metrics.speedKmh)} km/h`}
        </small>
      )}
      {session.average_heart_rate !== null && (
        <small>平均心率 {session.average_heart_rate} bpm</small>
      )}
    </div>
  );
}
