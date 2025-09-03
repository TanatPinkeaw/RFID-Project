export default function StatsCard({ title, value, icon, color }) {
  const colorClasses = {
    blue: "from-blue-500 to-purple-600",
    purple: "from-purple-500 to-pink-600", 
    yellow: "from-yellow-500 to-orange-600",
    green: "from-emerald-500 to-teal-600"
  };

  return (
    <div className="group bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-6 hover:bg-white hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 relative overflow-hidden">
      <div className={`absolute inset-0 bg-gradient-to-r ${colorClasses[color]}/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
      
      <div className="relative">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-sm font-semibold text-gray-600 uppercase tracking-wider">{title}</p>
            <p className="text-3xl font-black text-gray-800 mt-1">{value}</p>
          </div>
          <div className={`w-12 h-12 bg-gradient-to-r ${colorClasses[color]} rounded-xl flex items-center justify-center text-white text-2xl shadow-lg group-hover:scale-110 transition-transform duration-300`}>
            {icon}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 bg-${color === 'blue' ? 'blue' : color === 'purple' ? 'purple' : color === 'yellow' ? 'yellow' : 'emerald'}-500 rounded-full animate-pulse`}></div>
          <span className={`text-xs font-medium text-${color === 'blue' ? 'blue' : color === 'purple' ? 'purple' : color === 'yellow' ? 'yellow' : 'emerald'}-600 uppercase tracking-wide`}>
            Real-time
          </span>
        </div>
      </div>
    </div>
  );
}