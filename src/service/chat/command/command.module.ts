import { Module } from '@nestjs/common';
import { CommandService } from './command.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/user/auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [CommandService],
  exports: [CommandService]
})
export class CommandModule { }

