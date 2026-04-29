import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RadioModule } from './radio/radio.module';
import { IceCastConfig } from './config/icecast.config';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
      load: [IceCastConfig],
    }),
    RadioModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
