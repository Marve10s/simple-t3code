import { showBootError } from "./lib/bootError";

void import("./main").then(({ startup }) => startup).catch(showBootError);
