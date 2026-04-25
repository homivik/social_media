const fs = require('fs');

const LEVEL_PRIORITY = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40
};

function createLogger({ logLevel = 'INFO', logPath = 'bot.log' }) {
  const currentLevel = LEVEL_PRIORITY[logLevel] || LEVEL_PRIORITY.INFO;

  function write(level, component, message, details) {
    if ((LEVEL_PRIORITY[level] || LEVEL_PRIORITY.INFO) < currentLevel) {
      return;
    }

    const timestamp = new Date().toISOString();
    const suffix = details ? ` ${JSON.stringify(details)}` : '';
    const line = `[${timestamp}] [${level}] [${component}] ${message}${suffix}`;

    if (level === 'ERROR') {
      console.error(line);
    } else {
      console.log(line);
    }

    fs.appendFileSync(logPath, `${line}\n`, 'utf8');
  }

  return {
    debug: (component, message, details) => write('DEBUG', component, message, details),
    info: (component, message, details) => write('INFO', component, message, details),
    warn: (component, message, details) => write('WARN', component, message, details),
    error: (component, message, details) => write('ERROR', component, message, details)
  };
}

module.exports = {
  createLogger
};
