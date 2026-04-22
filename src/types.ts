export interface Owner {
  id: string;
  name: string;
  address?: string; // 住址
  numerator: number; // 權利範圍 分子
  denominator: number; // 權利範圍 分母
  proposedArea: number; // 原告主張面積
  appraisalValuePerM2: number; // 鑑定單價 (元/平方公尺)
}

export interface LandInfo {
  landId: string; // 地號 (如: 123-456)
  district: string; // 行政區/地段
  totalArea: number; // 總面積 (平方公尺)
  announcedValue: number; // 公告現值
  declaredValue: number; // 申報地價
}

export interface PartitionScheme {
  ownerId: string;
  description: string; // 主張內容
}

export interface CalculationResult {
  ownerId: string;
  entitledArea: number; // 應得面積
  entitledValue: number; // 應得價值 (按平均或特定單價)
  actualValue: number; // 實際價值 (按鑑定單價 * 主張面積)
  compensation: number; // 找補金額
}
