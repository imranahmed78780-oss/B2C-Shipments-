/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useRef } from 'react';
import { 
  Package, 
  Upload, 
  Download, 
  FileText, 
  CheckCircle2, 
  Clock, 
  ShieldCheck,
  Globe,
  Settings,
  History,
  Activity,
  Trash2,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import Papa from 'papaparse';
import { ExportShipment, Shipment, COUNTRY_CODES } from './types';

export default function App() {
  const [activities, setActivities] = useState<{ id: string; name: string; status: 'completed' | 'processing'; date: string; data: ExportShipment[] }[]>([]);
  const [analyzingFile, setAnalyzingFile] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [activeShipper, setActiveShipper] = useState<'Clothoo' | 'Falcon' | 'Well Products'>('Clothoo');
  const [customRate, setCustomRate] = useState<number>(1);
  const [shipmentSearchTerm, setShipmentSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateShipment = (activityId: string, rowIndex: number, field: keyof ExportShipment, value: any) => {
    setActivities(prev => prev.map(activity => {
      if (activity.id === activityId) {
        const newData = [...activity.data];
        const row = { ...newData[rowIndex], [field]: value };
        
        // Auto-multiply Quantity and Unit_Value for Total_Value
        if (field === 'Quantity' || field === 'Unit_Value') {
          const qty = Number(row.Quantity) || 0;
          const unitVal = Number(row.Unit_Value) || 0;
          row.Total_Value = qty * unitVal;
        }
        
        newData[rowIndex] = row;
        return { ...activity, data: newData };
      }
      return activity;
    }));
  };

  const filteredShipments = useMemo(() => {
    return activities.flatMap(activity => 
      activity.data.map((row, idx) => ({ ...row, activityId: activity.id, rowIndex: idx, activityName: activity.name }))
    ).filter(shipment => {
      if (!shipmentSearchTerm) return true;
      const tracking = String(shipment.HAWB_Number);
      return tracking.endsWith(shipmentSearchTerm) || tracking.includes(shipmentSearchTerm);
    });
  }, [activities, shipmentSearchTerm]);
  const stats = useMemo(() => {
    return [
      { label: 'Files Processed', value: activities.length, icon: FileText, color: 'text-indigo-600' },
      { label: 'Security Score', value: '98/100', icon: ShieldCheck, color: 'text-green-600' },
      { label: 'Export Ready', value: activities.filter(a => a.status === 'completed').length, icon: CheckCircle2, color: 'text-blue-600' },
      { label: 'Total Scans', value: activities.length * 42, icon: Activity, color: 'text-purple-600' },
    ];
  }, [activities]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAnalyzingFile(file.name);
    setProgress(0);

    // Simulate analysis progress
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 5;
      });
    }, 100);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rawData = results.data as any[];
        
        // Transform the data
        const transformedData: ExportShipment[] = rawData.map(row => {
          // Identify headers based on common shipper formats
          const tracking = String(row['Tracking Number'] || row['HAWB'] || row['HAWB Number'] || row['trackingNumber'] || '').trim();
          const recipient = row['Recipient Name And Company'] || row['Consignee Name'] || row['recipientName'];
          const city = row['Dest City Name'] || row['Consignee City'] || row['destCity'] || row['Consignee_City'];
          const weight = row['Shpmt Weight'] || row['Gross Weight'] || row['weight'] || row['Gross_Weight'];
          const weightUOM = row['Weight UOM'] || row['Unit Weight Code'] || row['weightUOM'] || row['Unit_Weight_Code'];
          const countryCode = (String(row['Recip Cntry'] || row['Consignee Country'] || row['destCountry'] || '')).trim().toUpperCase();
          const postal = row['Recip Postal Code'] || row['Consignee Postal Code'] || row['postalCode'] || row['Consignee_Postal_Code'];
          const inputValue = parseFloat(row['Customs Value'] || row['Unit Value'] || row['customsValue'] || '0');
          
          // EXTRACT QUANTITY from format like "1|1.0||" or "1|2.0||"
          const qtyString = row['CE Item QtyUnit 1'] || row['Quantity'] || '';
          const qtyParts = String(qtyString).split('|');
          let extractedQty = 1;
          if (qtyParts.length > 1) {
            extractedQty = parseFloat(qtyParts[1]) || 1;
          } else {
            extractedQty = parseFloat(row['Piece Cnt'] || row['Quantity'] || row['pieceCount'] || '1');
          }

          // Calculation: (Value * Rate) / Quantity
          const finalUnitValue = Math.round((inputValue * customRate) / extractedQty);

          // Get full country name from code
          const countryName = COUNTRY_CODES[countryCode] || countryCode;

          return {
            HS_Code: '',
            Declared_Description: 'B2C JACKETS',
            Origin: 'Pakistan',
            Quantity: extractedQty,
            Unit_Value: finalUnitValue,
            Total_Value: extractedQty * finalUnitValue,
            IMO_Class: '',
            HAWB_Number: tracking,
            Parcel_Category: 'E-Commerce',
            Sample_Category: 'General Goods',
            Item_Export_Type: 'Online Sale/Purchase',
            Gross_Weight: weight || 1,
            Unit_Weight_Code: weightUOM === 'K' ? 'KG' : (weightUOM || 'KG'),
            Identity_Type: 'NTN',
            Identity_Number: '4214470',
            Exporter_Name: activeShipper.toUpperCase(),
            Exporter_Address: activeShipper.toUpperCase(),
            Consignee_Name: recipient || '',
            Consignee_Address: city || '',
            Consignee_Country: countryName,
            Consignee_Country_Sub_Division: countryName,
            Consignee_City: city || '',
            Consignee_Street_PO_BOX: postal || '',
            Consignee_Postal_Code: postal || '',
            Repair_Replacement_ReturnFaulty_RejectedGoods: '',
            Remarks: '',
            GD_NO_Complete: '',
            Shipper_Name: activeShipper
          };
        });

        setTimeout(() => {
          const newActivity = {
            id: Math.random().toString(36).substr(2, 9),
            name: file.name,
            status: 'completed' as const,
            date: 'Just now',
            data: transformedData
          };
          setActivities(prev => [newActivity, ...prev]);
          setAnalyzingFile(null);
          setProgress(0);
        }, 2200);
      }
    });
  };

  const formatExportFilename = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${activeShipper} E-Commerce ${day}-${month}-${year}.xlsx`;
  };

  const EXPORT_COLUMNS = [
    'HS_Code', 'Declared_Description', 'Origin', 'Quantity', 'Unit_Value', 'Total_Value',
    'IMO_Class', 'HAWB_Number', 'Parcel_Category', 'Sample_Category', 'Item_Export_Type',
    'Gross_Weight', 'Unit_Weight_Code', 'Identity_Type', 'Identity_Number', 'Exporter_Name',
    'Exporter_Address', 'Consignee_Name', 'Consignee_Address', 'Consignee_Country',
    'Consignee_Country_Sub_Division', 'Consignee_City', 'Consignee_Street_PO_BOX',
    'Consignee_Postal_Code', 'Repair_Replacement_ReturnFaulty_RejectedGoods', 'Remarks',
    'GD_NO_Complete', 'Shipper_Name'
  ];

  const handleExport = async (data: ExportShipment[], filename?: string) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('B2C Shipments');

    // Add columns
    worksheet.columns = EXPORT_COLUMNS.map(col => ({ 
      header: col, 
      key: col, 
      width: Math.max(col.length + 5, 15) 
    }));

    // Add data
    worksheet.addRows(data);

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'BDD7EE' } // Light blue from user image
      };
      cell.font = {
        bold: true,
        size: 11,
        color: { argb: '000000' }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center'
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Style all data rows with borders
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell({ includeEmpty: false }, (cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          cell.alignment = {
            vertical: 'middle'
          };
        });
      }
    });

    // Write buffer and save
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const finalFilename = filename || formatExportFilename();
    saveAs(blob, finalFilename);
  };

  const clearAll = () => setActivities([]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      {/* Navigation */}
      <nav className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <span className="text-xl font-black">B</span>
          </div>
          <span className="text-xl font-black tracking-tight uppercase">B2C <span className="text-indigo-600">Shipments</span></span>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center gap-1.5 text-sm font-bold text-indigo-600 uppercase tracking-widest">
          <Activity size={16} /> Analysis
        </div>
        <div className="flex items-center gap-4">
          {activities.length > 0 && (
            <button 
              onClick={() => handleExport(activities.flatMap(a => a.data))}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-100 flex items-center gap-2 hover:bg-indigo-700 transition-all active:scale-95"
            >
              <Download size={14} />
              Export All
            </button>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-8 container mx-auto">
        <div className="grid grid-cols-1 gap-8">
          {/* Upload Area */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="group cursor-pointer bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 flex flex-col items-center justify-center text-center space-y-5 hover:border-indigo-400 hover:bg-indigo-50/20 transition-all duration-300"
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".csv" 
              onChange={handleFileUpload} 
            />
            <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <Upload className="w-10 h-10 text-indigo-600" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <h3 className="text-xl font-bold text-slate-800">B2C Shipments</h3>
              <p className="text-slate-500 text-sm mt-1">Select Shipper & upload your file</p>
              
              <div className="mt-4 flex flex-wrap justify-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-3xl" onClick={(e) => e.stopPropagation()}>
                {(['Clothoo', 'Falcon', 'Well Products'] as const).map((shipper) => (
                  <button
                    key={shipper}
                    onClick={() => setActiveShipper(shipper)}
                    className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      activeShipper === shipper 
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 scale-105' 
                        : 'bg-white text-slate-400 border border-slate-100 hover:text-slate-600'
                    }`}
                  >
                    {shipper}
                  </button>
                ))}
              </div>

              {/* Keep rate hidden or accessible if needed, but the UI focuses on shipper now */}
              <div className="mt-2 flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Rate:</span>
                <input 
                  type="number" 
                  value={customRate}
                  onChange={(e) => setCustomRate(parseFloat(e.target.value) || 1)}
                  className="w-10 bg-transparent text-[10px] font-bold text-slate-500 focus:outline-none border-b border-slate-200"
                  step="0.1"
                />
              </div>
            </div>
          </div>

          {/* Activity Table */}
          <div className="bg-white rounded-3xl border border-slate-200 flex-1 flex flex-col shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between bg-white gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search last 4 tracking digits..."
                  value={shipmentSearchTerm}
                  onChange={(e) => setShipmentSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                />
              </div>
              <button 
                onClick={clearAll}
                className="text-xs text-slate-400 hover:text-red-500 font-bold flex items-center gap-1.5 transition-colors uppercase tracking-widest whitespace-nowrap"
              >
                <Trash2 size={14} />
                Clear All
              </button>
            </div>
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-50">
                    <th className="px-6 py-4 font-black">Tracking Number</th>
                    <th className="px-6 py-4 font-black">Consignee</th>
                    <th className="px-6 py-4 font-black text-center">Qty</th>
                    <th className="px-6 py-4 font-black text-right">Unit Value</th>
                    <th className="px-6 py-4 font-black">Country</th>
                    <th className="px-6 py-4 font-black text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  <AnimatePresence>
                    {analyzingFile && (
                      <motion.tr 
                        initial={{ opacity: 0, y: -10 }} 
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-indigo-50/40"
                      >
                        <td colSpan={6} className="px-8 py-5 text-center">
                          <div className="flex items-center justify-center gap-3 text-indigo-600 font-bold">
                            <div className="w-4 h-4 bg-indigo-600 rounded-full animate-ping"></div>
                            Analyzing {analyzingFile}...
                            <div className="h-1.5 w-32 bg-slate-200 rounded-full overflow-hidden">
                              <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                            </div>
                          </div>
                        </td>
                      </motion.tr>
                    )}
                    {filteredShipments.map((row) => (
                        <motion.tr 
                          key={`${row.activityId}-${row.rowIndex}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          <td className="px-6 py-4 font-sans text-xs font-medium text-slate-900 whitespace-nowrap">
                            {row.HAWB_Number}
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-semibold text-xs text-slate-700">{row.Consignee_Name}</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <input 
                              type="number"
                              value={row.Quantity === 0 ? '' : row.Quantity}
                              onChange={(e) => updateShipment(row.activityId, row.rowIndex, 'Quantity', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                              className="w-12 bg-slate-100 rounded px-1.5 py-0.5 text-[10px] font-black text-slate-600 text-center focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1 font-bold text-xs text-indigo-600">
                              <span>$</span>
                              <input 
                                type="number"
                                value={row.Unit_Value === 0 ? '' : row.Unit_Value}
                                onChange={(e) => updateShipment(row.activityId, row.rowIndex, 'Unit_Value', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                                className="w-16 bg-transparent text-right border-b border-indigo-100 focus:border-indigo-400 focus:outline-none"
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-[10px] font-bold text-slate-500 truncate max-w-[100px] inline-block">
                              {row.Consignee_Country}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => {
                                const allData = activities.flatMap(a => a.data);
                                handleExport(allData);
                              }}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-black transition-all shadow-md active:scale-95 uppercase tracking-wider relative group"
                            >
                              <Download size={12} />
                              <span>Export Results</span>
                              <div className="absolute -top-1 -right-1">
                                <CheckCircle2 size={12} className="text-green-400" />
                              </div>
                            </button>
                          </td>
                        </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
              {activities.length === 0 && !analyzingFile && (
                <div className="p-20 text-center flex flex-col items-center justify-center space-y-4">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                    <History size={40} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-600">No activity yet</h3>
                    <p className="text-sm text-slate-400 max-w-xs mx-auto">Upload your first shipper sheet to start the automated transformation process.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer Bar */}
      <footer className="h-16 bg-white border-t border-slate-200 px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-400 font-medium py-4 sm:py-0">
        <div className="flex gap-6 items-center">
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>System: Operational</span>
          <span className="hidden sm:inline">Engine: V4.2 High-Speed</span>
        </div>
        <div className="flex gap-6 items-center">
          <span className="hover:text-indigo-600 cursor-pointer transition-colors">Privacy Policy</span>
          <span className="hover:text-indigo-600 cursor-pointer transition-colors">Documentation</span>
          <span className="text-slate-200">|</span>
          <span className="font-bold">&copy; 2024 B2C Logistics Lab</span>
        </div>
      </footer>
    </div>
  );
}
