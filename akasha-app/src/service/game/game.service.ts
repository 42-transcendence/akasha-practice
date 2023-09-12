import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";

@Injectable()
export class GameService implements OnApplicationBootstrap, OnModuleDestroy {
  updater: ReturnType<typeof setInterval> | undefined;

  async onApplicationBootstrap(): Promise<void> {
    Logger.log("Initialized", GameService.name);
    this.updater = setInterval(() => {
      //NOTE: @Interval을 사용할 수도 있음.
      Logger.log("Updated", GameService.name);
    }, 4000);
  }

  onModuleDestroy() {
    clearInterval(this.updater);
    Logger.log("Terminated", GameService.name);
  }
}
