import { INestApplication } from "@nestjs/common";

export class AkashaGlobal {
  private static app: INestApplication;

  static getInstance(): INestApplication {
    return this.app;
  }

  static setInstance(app: INestApplication) {
    this.app = app;
  }
}
