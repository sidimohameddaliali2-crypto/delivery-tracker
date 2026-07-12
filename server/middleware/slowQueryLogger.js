/**
 * Slow Query Logging Middleware
 * 
 * Monitors MongoDB queries and logs those exceeding a threshold duration.
 * Helps identify performance bottlenecks in the database layer.
 * 
 * Initialize: setupSlowQuerylogging()
 * 
 * Configuration:
 * - SLOW_QUERY_THRESHOLD_MS: milliseconds threshold (default: 100ms)
 * - LOG_SLOW_QUERIES: Enable/disable logging (default: true in development)
 */

import mongoose from 'mongoose';

const SLOW_QUERY_THRESHOLD = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '100', 10);
const ENABLE_SLOW_LOGS = process.env.LOG_SLOW_QUERIES !== '0';

/**
 * Setup slow query logging on Mongoose connection
 * Call after mongoose.connect()
 */
export const setupSlowQuerylogging = () => {
  if (!ENABLE_SLOW_LOGS) {
    console.log('💤 Slow query logging disabled');
    return;
  }

  const db = mongoose.connection;

  // Log query events
  db.on('open', () => {
    console.log(`⏱️  Slow query logging enabled (threshold: ${SLOW_QUERY_THRESHOLD}ms)`);

    // Monitor all query types
    ['find', 'count', 'countDocuments', 'distinct', 'findOneAndUpdate', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany'].forEach((method) => {
      mongoose.Query.prototype.constructor.collection.on('query', function (query) {
        const startTime = Date.now();
        
        const original = query.constructor.prototype[method];
        if (!original) return;

        query.constructor.prototype[method] = function (...args) {
          const start = Date.now();
          const result = original.apply(this, args);

          if (result && typeof result.then === 'function') {
            return result
              .then((res) => {
                logSlowQuery(method, this, Date.now() - start);
                return res;
              })
              .catch((err) => {
                logSlowQuery(method, this, Date.now() - start, err);
                throw err;
              });
          }

          return result;
        };
      });
    });
  });
};

/**
 * Setup slow query logging using low-level MongoDB command monitoring
 * This is more reliable than the Mongoose approach
 */
export const setupMongooseSlowQueryMonitoring = () => {
  if (!ENABLE_SLOW_LOGS) {
    console.log('💤 Slow query logging disabled');
    return;
  }

  try {
    const mongodbClient = mongoose.connection.getClient();
    
    if (!mongodbClient) {
      console.warn('⚠️  MongoDB client not available for slow query monitoring');
      return;
    }

    mongodbClient.on('commandStarted', (event) => {
      // Store start time for this command
      event._startTime = Date.now();
    });

    mongodbClient.on('commandSucceeded', (event) => {
      const duration = Date.now() - (event._startTime || Date.now());
      
      if (duration > SLOW_QUERY_THRESHOLD) {
        console.warn(
          `⏱️  SLOW QUERY (${duration}ms): ${event.commandName} on ${event.databaseName} collection`
        );
        
        // Log the query details for debugging
        if (process.env.NODE_ENV === 'development') {
          console.warn('   Details:', JSON.stringify(event.command, null, 2).substring(0, 500));
        }
      }
    });

    mongodbClient.on('commandFailed', (event) => {
      const duration = Date.now() - (event._startTime || Date.now());
      
      console.error(
        `❌ QUERY FAILED (${duration}ms): ${event.commandName} on ${event.databaseName}\n   Error: ${event.failure.message}`
      );
    });

    console.log(`⏱️  MongoDB slow query monitoring enabled (threshold: ${SLOW_QUERY_THRESHOLD}ms)`);
  } catch (error) {
    console.warn('⚠️  Failed to setup MongoDB command monitoring:', error.message);
  }
};

/**
 * Log a slow query
 * @param {string} method - Query method name
 * @param {object} query - Mongoose query object
 * @param {number} duration - Query duration in milliseconds
 * @param {Error} error - Error if query failed
 */
const logSlowQuery = (method, query, duration, error = null) => {
  if (duration < SLOW_QUERY_THRESHOLD) {
    return;
  }

  const model = query.model?.modelName || 'Unknown';
  const filter = query.getFilter?.() || query._conditions || '{}';
  
  const logLevel = duration > SLOW_QUERY_THRESHOLD * 5 ? '🔴' : '🟡';
  
  console.warn(
    `${logLevel} SLOW QUERY (${duration}ms) ${method}(${model})`
  );
  
  if (process.env.NODE_ENV === 'development') {
    console.warn(`   Filter: ${JSON.stringify(filter).substring(0, 200)}`);
    if (error) {
      console.warn(`   Error: ${error.message}`);
    }
  }
};

export default {
  setupSlowQuerylogging,
  setupMongooseSlowQueryMonitoring,
};
