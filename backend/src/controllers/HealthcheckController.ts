import { Request, Response } from "express";
import Controller, { Methods } from "./Controller";

export default class HealthcheckController extends Controller {
  path = "/";

  routes = [
    {
      path: "/health",
      method: Methods.GET,
      handler: this.handleHealthcheck.bind(this),
      localMiddleware: [],
    },
  ];


  async handleHealthcheck(req: Request, res: Response): Promise<void> {
    res.sendStatus(200);
  }
}
