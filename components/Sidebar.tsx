import React from 'react';
import { 
  Type, 
  Image as ImageIcon, 
  BarChart3, 
  LineChart, 
  Radar as RadarIcon,
  Triangle,
  Gauge, 
  Table as TableIcon, 
  Filter,
  LayoutDashboard,
  Settings
} from 'lucide-react';
import { UserRole, WidgetType } from '../types';

interface SidebarProps {
  onAddWidget: (type: WidgetType) => void;
  showMenu?: boolean;
  onBack?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const WIDGET_CATEGORIES = [
  {
    title: 'Elementos',
    items: [
      { type: 'text', label: 'Texto', icon: Type },
      { type: 'image', label: 'Imagem', icon: ImageIcon },
      { type: 'filter', label: 'Filtro', icon: Filter },
      { type: 'counter', label: 'Contador', icon: Settings },
      { type: 'card', label: 'Card', icon: LayoutDashboard },
    ]
  },
  {
    title: 'Gráficos',
    items: [
      { type: 'bar_chart', label: 'Barras', icon: BarChart3 },
      { type: 'line_chart', label: 'Linha', icon: LineChart },
      { type: 'radar_chart', label: 'Radar', icon: RadarIcon },
      { type: 'funnel_chart', label: 'Funil', icon: Triangle },
      { type: 'gauge', label: 'Gauge', icon: Gauge },
      { type: 'table', label: 'Tabela', icon: TableIcon },
    ]
  }
];

const MOCK_MENU = [
  { label: 'Dashboard', icon: LayoutDashboard, view: 'list' },
  { label: 'Criar dashboard', icon: Settings, view: 'builder' },
];

export const Sidebar: React.FC<
  SidebarProps & {
    activeView?: 'list' | 'builder' | 'extractor' | 'settings' | 'admin';
    onNavigateView?: (view: 'list' | 'builder' | 'extractor' | 'settings' | 'admin') => void;
    toolName?: string;
    logoUrl?: string | null;
    userRole?: UserRole | null;
  }
> = ({
  onAddWidget,
  showMenu = true,
  onBack,
  activeView = 'list',
  onNavigateView,
  collapsed = false,
  onToggleCollapse,
  toolName = 'Project Lara',
  logoUrl,
  userRole,
}) => {
  const handleDragStart = (e: React.DragEvent, type: WidgetType) => {
    e.dataTransfer.setData('widgetType', type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const menuItems = userRole === 'admin'
    ? [...MOCK_MENU, { label: 'Configurações', icon: Settings, view: 'admin' as const }]
    : MOCK_MENU;

  return (
    <div className={`${collapsed ? 'w-20' : 'w-64'} bg-white flex flex-col h-full shadow-sm z-30 transition-all duration-300`}>
      {/* Sidebar Header */}
      <div className="h-20 flex items-center justify-between px-6">
        {collapsed ? (
          <div className="w-10 h-10 rounded-xl bg-[#5B4DFF]/10 overflow-hidden flex items-center justify-center text-[#5B4DFF]">
            {logoUrl ? <img src={logoUrl} alt={toolName} className="w-full h-full object-contain" /> : <LayoutDashboard className="w-5 h-5" />}
          </div>
        ) : (
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#5B4DFF]/10 overflow-hidden flex items-center justify-center text-[#5B4DFF] shrink-0">
              {logoUrl ? <img src={logoUrl} alt={toolName} className="w-full h-full object-contain" /> : <LayoutDashboard className="w-5 h-5" />}
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800 truncate">
              {toolName}
            </h1>
          </div>
        )}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-2 text-gray-500 hover:text-[#5B4DFF] hover:bg-[#F3F4F8] rounded-lg"
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? '→' : '←'}
          </button>
        )}
      </div>

      {showMenu && (
        <>
          <div className="px-4 mb-8 space-y-1">
            {menuItems.map((item) => (
              <div 
                key={item.label}
                onClick={() => onNavigateView?.(item.view)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium cursor-pointer transition-colors ${
                  activeView === item.view 
                    ? 'bg-[#F3F4F8] text-[#5B4DFF]' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
              >
                <item.icon size={20} strokeWidth={2} />
                {!collapsed && <span>{item.label}</span>}
                {activeView === item.view && !collapsed && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#5B4DFF]"></div>}
              </div>
            ))}
          </div>
          <div className="px-8 mb-6">
            <div className="h-px bg-gray-100 w-full"></div>
          </div>
        </>
      )}

      {/* Widget List */}
      <div className={`flex-1 overflow-y-auto pb-6 space-y-6 ${collapsed ? 'px-3' : 'px-6'}`}>
        <div className="flex items-center justify-between mb-2">
          {!collapsed && <h3 className="text-sm font-bold text-gray-800">Widgets</h3>}
          {!collapsed && (
            <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Arrastar</span>
          )}
        </div>

        {WIDGET_CATEGORIES.map((category) => (
          <div key={category.title}>
            {!collapsed && (
              <h4 className="text-xs font-semibold text-gray-400 uppercase mb-3 tracking-wider ml-1">
                {category.title}
              </h4>
            )}
            <div className={`grid ${collapsed ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
              {category.items.map((item) => (
                <div
                  key={item.type}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item.type as WidgetType)}
                  onClick={() => onAddWidget(item.type as WidgetType)}
                  className="flex flex-col items-center justify-center p-3 bg-white border border-gray-100 shadow-sm rounded-2xl hover:shadow-md hover:border-[#5B4DFF] hover:scale-[1.02] cursor-grab active:cursor-grabbing transition-all group"
                >
                  <div className="w-10 h-10 bg-[#F3F4F8] rounded-full flex items-center justify-center mb-2 group-hover:bg-[#EEECFF]">
                    <item.icon className="text-gray-600 group-hover:text-[#5B4DFF]" size={20} strokeWidth={2} />
                  </div>
                  {!collapsed && <span className="text-xs text-gray-600 font-medium">{item.label}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
