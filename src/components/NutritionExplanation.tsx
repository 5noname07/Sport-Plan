import type { NutritionTarget } from '../domain/calculations';
import { format } from './shared';

export function NutritionExplanation({
  target,
  strengthCount,
  cardioCount,
}: {
  target: NutritionTarget | null;
  strengthCount: number;
  cardioCount: number;
}) {
  return (
    <div className="nutrition-explanation">
      <p>
        当天活动：力量 {strengthCount} 次 · 有氧 {cardioCount} 次
      </p>
      {target ? (
        <>
          <p>
            日常基础目标 {format(target.baseCalories)} + 力量净消耗{' '}
            {format(target.strengthCalories)} + 有氧净消耗 {format(target.cardioCalories)} ={' '}
            <strong>{format(target.calories)} kcal</strong>
          </p>
          {target.unestimatedCardio > 0 && (
            <p>{target.unestimatedCardio} 项有氧缺少时长或适用的强度参数，未追加热量。</p>
          )}
        </>
      ) : (
        <p>缺少身体信息或该日之前的体重，暂不估算消耗与目标。</p>
      )}
      <small>
        均为估算；日常活动系数不含专门训练。已计入日常活动的运动请在有氧记录中关闭“计入营养调整”。
      </small>
    </div>
  );
}
