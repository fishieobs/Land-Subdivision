import React, { useState, useMemo } from 'react';
import { 
  FileText, 
  Upload, 
  Table as TableIcon, 
  Calculator, 
  Download, 
  Plus, 
  Trash2, 
  AlertCircle,
  FileSpreadsheet,
  FileBadge
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { extractLandDataFromPdf } from './lib/gemini.ts';
import { Owner, LandInfo, CalculationResult } from './types.ts';
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType } from 'docx';
import { saveAs } from 'file-saver';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [landInfo, setLandInfo] = useState<LandInfo | null>(null);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'edit' | 'calculate'>('upload');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const data = await extractLandDataFromPdf(base64);
        
        setLandInfo(data.landInfo);
        setOwners(data.owners.map((o: any, index: number) => ({
          ...o,
          id: `owner-${index}`,
          proposedArea: (data.landInfo.totalArea * o.numerator) / o.denominator,
          appraisalValuePerM2: data.landInfo.announcedValue || 0,
        })));
        setActiveTab('edit');
      };
    } catch (error) {
      console.error('Error parsing PDF:', error);
      alert('解析 PDF 失敗，請重試或手動輸入補全。');
    } finally {
      setIsLoading(false);
    }
  };

  const addOwner = () => {
    setOwners([...owners, {
      id: Math.random().toString(36).substr(2, 9),
      name: '新共有人',
      numerator: 0,
      denominator: 1,
      proposedArea: 0,
      appraisalValuePerM2: landInfo?.announcedValue || 0,
    }]);
  };

  const removeOwner = (id: string) => {
    setOwners(owners.filter(o => o.id !== id));
  };

  const updateOwner = (id: string, updates: Partial<Owner>) => {
    setOwners(owners.map(o => o.id === id ? { ...o, ...updates } : o));
  };

  const results = useMemo(() => {
    if (!landInfo) return [];

    // 計算總價值 (基於每個人被鑑定分配後的價值加總)
    const totalAppraisedValue = owners.reduce((acc, o) => acc + (o.proposedArea * o.appraisalValuePerM2), 0);
    
    return owners.map(o => {
      const share = o.numerator / (o.denominator || 1);
      const entitledArea = landInfo.totalArea * share;
      const entitledValue = totalAppraisedValue * share;
      const actualValue = o.proposedArea * o.appraisalValuePerM2;
      const compensation = actualValue - entitledValue;

      return {
        ownerId: o.id,
        entitledArea,
        entitledValue,
        actualValue,
        compensation
      };
    });
  }, [landInfo, owners]);

  const exportToExcel = () => {
    if (!landInfo) return;

    const data = owners.map(o => {
      const result = results.find(r => r.ownerId === o.id);
      return {
        '共有人姓名': o.name,
        '住址': o.address || '',
        '權利範圍(分子)': o.numerator,
        '權利範圍(分母)': o.denominator,
        '應得面積': result?.entitledArea.toFixed(2),
        '主張面積': o.proposedArea.toFixed(2),
        '鑑定單價(元/m2)': o.appraisalValuePerM2,
        '應有價值': result?.entitledValue.toFixed(0),
        '實際價值': result?.actualValue.toFixed(0),
        '找補金額': result?.compensation.toFixed(0)
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '土地分割清冊');
    XLSX.writeFile(wb, `土地分割案_${landInfo.landId}.xlsx`);
  };

  const exportToWord = () => {
    if (!landInfo) return;

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: "土地分割案 找補金額計算清冊", bold: true, size: 36 }),
            ],
          }),
          new Paragraph({ text: `地號：${landInfo.district || ''} ${landInfo.landId}` }),
          new Paragraph({ text: `總面積：${landInfo.totalArea} 平方公尺` }),
          new Paragraph({ text: "" }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                   new TableCell({ children: [new Paragraph("姓名")] }),
                   new TableCell({ children: [new Paragraph("住址")] }),
                   new TableCell({ children: [new Paragraph("權利範圍")] }),
                   new TableCell({ children: [new Paragraph("應得面積")] }),
                   new TableCell({ children: [new Paragraph("主張面積")] }),
                   new TableCell({ children: [new Paragraph("找補金額")] }),
                ],
              }),
              ...owners.map(o => {
                const r = results.find(res => res.ownerId === o.id);
                return new TableRow({
                  children: [
                     new TableCell({ children: [new Paragraph(o.name)] }),
                     new TableCell({ children: [new Paragraph(o.address || '')] }),
                     new TableCell({ children: [new Paragraph(`${o.numerator}/${o.denominator}`)] }),
                     new TableCell({ children: [new Paragraph(r?.entitledArea.toFixed(2) || '0')] }),
                     new TableCell({ children: [new Paragraph(o.proposedArea.toFixed(2))] }),
                     new TableCell({ children: [new Paragraph(r?.compensation.toFixed(0) || '0')] }),
                  ],
                });
              }),
            ],
          }),
        ],
      }],
    });

    Packer.toBlob(doc).then(blob => {
      saveAs(blob, `土地分割案_${landInfo.landId}.docx`);
    });
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#2D3436] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-6 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg overflow-hidden shadow-inner">
              <img src="icon.svg" alt="Logo" className="w-full h-full p-1.5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-gray-900">土地分割與找補試算系統</h1>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Land Partition & Compensation System</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {landInfo && (
              <button 
                onClick={() => {
                  if(confirm("確定要清除目前所有資料並重新開始嗎？")) {
                    setLandInfo(null);
                    setOwners([]);
                    setActiveTab('upload');
                  }
                }}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="重新開始"
              >
                <Trash2 size={20} />
              </button>
            )}
            <nav className="flex bg-gray-100 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('upload')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2",
                activeTab === 'upload' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              <Upload size={16} /> 匯入謄本
            </button>
            <button 
              onClick={() => setActiveTab('edit')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2",
                activeTab === 'edit' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
              disabled={!landInfo}
            >
              <TableIcon size={16} /> 共有資料
            </button>
            <button 
              onClick={() => setActiveTab('calculate')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2",
                activeTab === 'calculate' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
              disabled={!landInfo}
            >
              <Calculator size={16} /> 找補試算
            </button>
          </nav>
        </div>
      </div>
    </header>

      <main className="max-w-7xl mx-auto p-8">
        <AnimatePresence mode="wait">
          {activeTab === 'upload' && (
            <motion.div 
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center min-h-[60vh]"
            >
              <div className="w-full max-w-2xl bg-white rounded-3xl border-2 border-dashed border-gray-300 p-12 transition-all hover:border-indigo-400 group">
                <div className="flex flex-col items-center text-center">
                  <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-500 mb-6 group-hover:scale-110 transition-transform duration-300">
                    <FileText size={40} />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">上傳土地登記謄本</h2>
                  <p className="text-gray-500 mb-8 max-w-sm">
                    支援 PDF 格式，系統將自動解析地號、面積、及所有共有人權利範圍資料。
                  </p>
                  
                  <div className="flex flex-col sm:flex-row gap-4">
                    <label className="relative cursor-pointer bg-indigo-600 text-white px-8 py-3 rounded-full font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">
                      {isLoading ? '解析中...' : '上傳謄本解析'}
                      <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} disabled={isLoading} />
                    </label>
                    <button 
                      onClick={() => {
                        setLandInfo({
                          landId: '新案件-001',
                          district: '市/區/段',
                          totalArea: 100,
                          announcedValue: 0,
                          declaredValue: 0
                        });
                        setOwners([{
                          id: 'owner-1',
                          name: '所有權人A',
                          address: '請輸入地址',
                          numerator: 1,
                          denominator: 1,
                          proposedArea: 100,
                          appraisalValuePerM2: 0
                        }]);
                        setActiveTab('edit');
                      }}
                      className="px-8 py-3 rounded-full font-bold border-2 border-gray-200 hover:border-indigo-600 hover:text-indigo-600 transition-all"
                    >
                      手動建立空案件
                    </button>
                  </div>
                  
                  {isLoading && (
                    <div className="mt-8 flex items-center gap-3 text-indigo-600">
                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-sm font-semibold">AI 正在深度掃描謄本內容...</span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'edit' && landInfo && (
            <motion.div 
              key="edit"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              {/* Land Info Header */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">地號 / 地段</p>
                  <input 
                    className="text-lg font-bold w-full focus:outline-none focus:text-indigo-600"
                    value={landInfo.landId}
                    onChange={e => setLandInfo({...landInfo, landId: e.target.value})}
                  />
                  <p className="text-sm text-gray-400 mt-1">{landInfo.district}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">總面積 (m²)</p>
                  <input 
                    type="number"
                    className="text-lg font-bold w-full focus:outline-none focus:text-indigo-600"
                    value={landInfo.totalArea}
                    onChange={e => setLandInfo({...landInfo, totalArea: Number(e.target.value)})}
                  />
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">公告現值 (元/m²)</p>
                  <input 
                    type="number"
                    className="text-lg font-bold w-full focus:outline-none focus:text-indigo-600"
                    value={landInfo.announcedValue}
                    onChange={e => setLandInfo({...landInfo, announcedValue: Number(e.target.value)})}
                  />
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">申報地價 (元/m²)</p>
                  <input 
                    type="number"
                    className="text-lg font-bold w-full focus:outline-none focus:text-indigo-600"
                    value={landInfo.declaredValue}
                    onChange={e => setLandInfo({...landInfo, declaredValue: Number(e.target.value)})}
                  />
                </div>
              </div>

              {/* Owners Table */}
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                  <h3 className="font-bold flex items-center gap-2">
                    所有權部 - 共有人清冊 
                    <span className="bg-indigo-100 text-indigo-600 text-xs px-2 py-1 rounded-md">{owners.length} 人</span>
                  </h3>
                  <button 
                    onClick={addOwner}
                    className="flex items-center gap-1 text-sm font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Plus size={16} /> 新增共有人
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-gray-100 italic text-[11px] uppercase tracking-widest text-gray-400 font-serif">
                        <th className="px-6 py-4">姓名</th>
                        <th className="px-6 py-4">住址</th>
                        <th className="px-6 py-4">權利範圍 (分子/分母)</th>
                        <th className="px-6 py-4">應得面積 (m²)</th>
                        <th className="px-6 py-4">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {owners.map(owner => (
                        <tr key={owner.id} className="group hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <input 
                              className="font-medium bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-200 rounded px-2"
                              value={owner.name}
                              onChange={e => updateOwner(owner.id, { name: e.target.value })}
                            />
                          </td>
                          <td className="px-6 py-4">
                            <input 
                              className="text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-200 rounded px-2 w-full"
                              value={owner.address || ''}
                              placeholder="載入中或未填寫"
                              onChange={e => updateOwner(owner.id, { address: e.target.value })}
                            />
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <input 
                                type="number"
                                className="w-16 border rounded px-2 py-1 text-sm bg-white"
                                value={owner.numerator}
                                onChange={e => updateOwner(owner.id, { numerator: Number(e.target.value) })}
                              />
                              <span className="text-gray-400">/</span>
                              <input 
                                type="number"
                                className="w-20 border rounded px-2 py-1 text-sm bg-white"
                                value={owner.denominator}
                                onChange={e => updateOwner(owner.id, { denominator: Number(e.target.value) })}
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono text-sm text-gray-600">
                            {((landInfo.totalArea * owner.numerator) / (owner.denominator || 1)).toFixed(2)}
                          </td>
                          <td className="px-6 py-4">
                            <button 
                              onClick={() => removeOwner(owner.id)}
                              className="text-red-400 hover:text-red-600 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'calculate' && landInfo && (
            <motion.div 
              key="calculate"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8"
            >
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-2xl font-bold">分割方案與金錢找補試算</h2>
                  <p className="text-gray-500">輸入主張分配的面積與鑑定單價，系統將自動計算找補金額。</p>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={exportToExcel}
                    className="flex items-center gap-2 px-4 py-2 border border-green-600 text-green-600 rounded-xl hover:bg-green-50 transition-colors text-sm font-bold"
                  >
                    <FileSpreadsheet size={16} /> 匯出 Excel
                  </button>
                  <button 
                    onClick={exportToWord}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100 text-sm font-bold"
                  >
                    <Download size={16} /> 匯出 Word 報告
                  </button>
                </div>
              </div>

              <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl flex items-start gap-3">
                <AlertCircle className="text-indigo-600 shrink-0" size={20} />
                <div className="text-xs text-indigo-800 leading-relaxed">
                  <p className="font-bold mb-1">計算模型說明：</p>
                  <p>1. 應有價值 =（全案各共有人分配面積 × 分配單價之總和）× 該共有人權利範圍。</p>
                  <p>2. 實際價值 = 該共有人主張分配面積 × 該分配區塊之鑑定單價。</p>
                  <p>3. 找補金額 = 實際價值 - 應有價值。正值代表應支付予他人，負值代表應受補償。</p>
                </div>
              </div>

              <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-900 text-white text-[10px] uppercase tracking-[0.2em] font-medium">
                        <th className="px-6 py-5">共有人</th>
                        <th className="px-6 py-5">應得價值</th>
                        <th className="px-6 py-5">主張分配面積 (m²)</th>
                        <th className="px-6 py-5">鑑定單價 (元/m²)</th>
                        <th className="px-6 py-5">實際價值</th>
                        <th className="px-6 py-5 bg-indigo-900">找補金額</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {owners.map(owner => {
                        const res = results.find(r => r.ownerId === owner.id);
                        return (
                          <tr key={owner.id} className="hover:bg-indigo-50/30 transition-colors">
                            <td className="px-6 py-5">
                              <p className="font-bold text-gray-900">{owner.name}</p>
                              <p className="text-[10px] text-gray-400 font-mono italic">Share: {owner.numerator}/{owner.denominator}</p>
                            </td>
                            <td className="px-6 py-5">
                              <p className="text-sm font-mono text-gray-600">${res?.entitledValue.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
                            </td>
                            <td className="px-6 py-5">
                              <input 
                                type="number"
                                className="w-full border-b border-gray-200 focus:border-indigo-500 bg-transparent py-1 font-bold text-indigo-600 text-lg"
                                value={owner.proposedArea}
                                onChange={e => updateOwner(owner.id, { proposedArea: Number(e.target.value) })}
                              />
                            </td>
                            <td className="px-6 py-5">
                              <input 
                                type="number"
                                className="w-full border-b border-gray-200 focus:border-indigo-500 bg-transparent py-1 font-mono"
                                value={owner.appraisalValuePerM2}
                                onChange={e => updateOwner(owner.id, { appraisalValuePerM2: Number(e.target.value) })}
                              />
                            </td>
                            <td className="px-6 py-5">
                              <p className="text-sm font-mono text-gray-600">${res?.actualValue.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
                            </td>
                            <td className={cn(
                              "px-6 py-5 font-bold text-lg font-mono",
                              (res?.compensation || 0) > 0 ? "text-red-500" : (res?.compensation || 0) < 0 ? "text-green-500" : "text-gray-400"
                            )}>
                              {res?.compensation && res.compensation !== 0 ? (res.compensation > 0 ? "+" : "") : ""}
                              {res?.compensation.toLocaleString(undefined, {maximumFractionDigits: 0})}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-gray-50">
                        <td className="px-6 py-4 font-bold text-gray-400 text-xs italic">CHECK SUM</td>
                        <td className="px-6 py-4"></td>
                        <td className="px-6 py-4 font-mono font-bold text-gray-400">
                          {owners.reduce((acc, o) => acc + o.proposedArea, 0).toFixed(2)} / {landInfo.totalArea}
                        </td>
                        <td className="px-6 py-4"></td>
                        <td className="px-6 py-4"></td>
                        <td className="px-6 py-4 font-mono font-bold text-indigo-600">
                          {results.reduce((acc, r) => acc + r.compensation, 0).toFixed(0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Info */}
      <footer className="max-w-7xl mx-auto px-8 py-12 border-t border-gray-100 mt-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-indigo-600 font-bold">
              <FileBadge size={20} />
              <span>系統簡介</span>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
              本系統由 Google Gemini 驅動，專為法律實務設計。
              自動化處理土地分割糾紛中最繁瑣的資料匯入與找補試算環節。
            </p>
          </div>
          <div className="space-y-4">
            <h4 className="font-bold text-gray-900 border-l-4 border-indigo-600 pl-3">資料安全性</h4>
            <p className="text-sm text-gray-500 leading-relaxed">
              所有文件解析均在安全環節下進行，系統不留存任何個人謄本資料，僅用於即時試算與匯出文件。
            </p>
          </div>
          <div className="space-y-4 text-right">
            <p className="text-xs text-gray-400 uppercase tracking-widest">&copy; 2026 Partition AI Expert</p>
            <div className="flex justify-end gap-4 text-gray-400">
              <FileText size={20} className="hover:text-indigo-600 cursor-pointer transition-colors" />
              <FileSpreadsheet size={20} className="hover:text-green-600 cursor-pointer transition-colors" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
