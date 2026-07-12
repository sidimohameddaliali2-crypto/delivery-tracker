import React from 'react';
import { motion } from 'framer-motion';

const KPICard = ({ card, index, showValues = false }) => {
  const Icon = card.icon;
  const isLoading = card.isLoading || false;
  
  const getColorClasses = (color) => {
    const colors = {
      blue: {
        gradient: 'from-blue-500 to-blue-600',
        iconBg: 'bg-blue-100',
        iconColor: 'text-blue-600',
        glow: 'shadow-blue-200',
        hover: 'hover:shadow-blue-300'
      },
      green: {
        gradient: 'from-emerald-500 to-green-600',
        iconBg: 'bg-emerald-100',
        iconColor: 'text-emerald-600',
        glow: 'shadow-emerald-200',
        hover: 'hover:shadow-emerald-300'
      },
      red: {
        gradient: 'from-red-500 to-rose-600',
        iconBg: 'bg-red-100',
        iconColor: 'text-red-600',
        glow: 'shadow-red-200',
        hover: 'hover:shadow-red-300'
      },
      purple: {
        gradient: 'from-purple-500 to-violet-600',
        iconBg: 'bg-purple-100',
        iconColor: 'text-purple-600',
        glow: 'shadow-purple-200',
        hover: 'hover:shadow-purple-300'
      },
      orange: {
        gradient: 'from-orange-500 to-amber-600',
        iconBg: 'bg-orange-100',
        iconColor: 'text-orange-600',
        glow: 'shadow-orange-200',
        hover: 'hover:shadow-orange-300'
      },
      teal: {
        gradient: 'from-teal-500 to-cyan-600',
        iconBg: 'bg-teal-100',
        iconColor: 'text-teal-600',
        glow: 'shadow-teal-200',
        hover: 'hover:shadow-teal-300'
      },
      yellow: {
        gradient: 'from-yellow-500 to-orange-500',
        iconBg: 'bg-yellow-100',
        iconColor: 'text-yellow-600',
        glow: 'shadow-yellow-200',
        hover: 'hover:shadow-yellow-300'
      }
    };
    return colors[color] || colors.blue;
  };

  const colorConfig = getColorClasses(card.color);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ 
        duration: 0.6, 
        delay: index * 0.1,
        type: "spring",
        stiffness: 100
      }}
      whileHover={{ 
        y: -8,
        transition: { duration: 0.2 }
      }}
      className={`group relative bg-white rounded-2xl shadow-lg ${colorConfig.glow} ${colorConfig.hover} 
                 transition-all duration-300 ease-in-out cursor-pointer overflow-hidden
                 border border-gray-100`}
    >
      {/* Gradient Background Accent */}
      <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${colorConfig.gradient}`}></div>
      
      {/* Subtle Pattern Background */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" 
             style={{
               backgroundImage: `radial-gradient(circle at 20px 20px, currentColor 1px, transparent 0)`,
               backgroundSize: '40px 40px'
             }}></div>
      </div>

      {/* Main Content */}
      <div className="relative p-6">
        <div className="flex items-start justify-between">
          {/* Left Side - Content */}
          <div className="flex-1">
            <div className="flex items-center mb-3">
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                {card.title}
              </h3>
              <motion.div 
                className="ml-2 w-2 h-2 rounded-full bg-green-400"
                animate={{ 
                  scale: [1, 1.2, 1],
                  opacity: [1, 0.8, 1]
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
            </div>
            
            {showValues && (
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ delay: index * 0.1 + 0.2, duration: 0.4 }}
              >
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <motion.div
                      className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    />
                    <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
                  </div>
                ) : (
                  <p className="text-3xl font-bold text-gray-900 mb-2 leading-tight">
                    {card.value}
                  </p>
                )}
              </motion.div>
            )}
          </div>

          {/* Right Side - Icon */}
          <div className="relative">
            <motion.div
              className={`p-4 rounded-xl ${colorConfig.iconBg} group-hover:scale-110 
                         transition-transform duration-300`}
              whileHover={{ rotate: 5 }}
              transition={{ duration: 0.2 }}
            >
              <Icon className={`w-8 h-8 ${colorConfig.iconColor}`} />
              
              {/* Glow Effect */}
              <motion.div 
                className={`absolute inset-0 rounded-xl ${colorConfig.iconBg} opacity-0 
                           group-hover:opacity-30 transition-opacity duration-300`}
                animate={{ 
                  scale: [1, 1.2, 1],
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
            </motion.div>

            {/* Floating Indicator */}
            <motion.div 
              className={`absolute -top-1 -right-1 w-3 h-3 rounded-full bg-gradient-to-r ${colorConfig.gradient}`}
              animate={{ 
                scale: [1, 1.3, 1],
                opacity: [1, 0.7, 1]
              }}
              transition={{ 
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          </div>
        </div>
      </div>

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent 
                      opacity-0 group-hover:opacity-100 transition-opacity duration-300 
                      pointer-events-none rounded-2xl" />
    </motion.div>
  );
};

export default KPICard;