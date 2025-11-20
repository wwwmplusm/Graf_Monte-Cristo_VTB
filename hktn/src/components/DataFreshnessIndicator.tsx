import React from 'react';
import { DataFreshness } from '../utils/api';

interface Props {
  freshness: DataFreshness[];
}

export function DataFreshnessIndicator({ freshness }: Props) {
  const getStatusColor = (ageMinutes: number): string => {
    if (ageMinutes < 5) return 'text-green-600';
    if (ageMinutes < 30) return 'text-yellow-600';
    return 'text-gray-500';
  };

  const formatAge = (ageMinutes: number): string => {
    if (ageMinutes < 60) return `${ageMinutes} мин назад`;
    const hours = Math.floor(ageMinutes / 60);
    if (hours < 24) return `${hours} ч назад`;
    const days = Math.floor(hours / 24);
    return `${days} дн назад`;
  };

  if (freshness.length === 0) {
    return null;
  }

  return (
    <div className="text-sm space-y-1">
      <div className="text-gray-400 text-xs mb-2">Актуальность данных:</div>
      {freshness.map((f) => (
        <div key={f.bank_id} className={`${getStatusColor(f.age_minutes)}`}>
          <span className="font-medium">{f.bank_id}:</span> {formatAge(f.age_minutes)}
        </div>
      ))}
    </div>
  );
}

