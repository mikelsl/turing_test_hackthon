import 'dotenv/config';
import { TuringMindGamesBot } from './TuringMindGamesBot.js';

const token = process.env.TURING_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('Missing TURING_TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_TOKEN');

const bot = new TuringMindGamesBot(token);
await bot.launch();

const shutdown = (signal: string) => {
  try {
    bot.stop(signal);
  } finally {
    process.exit(0);
  }
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
