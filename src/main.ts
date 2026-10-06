import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  app.enableShutdownHooks();
  new Logger('Bootstrap').log('Job alert bot is running. Press Ctrl+C to stop.');
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
