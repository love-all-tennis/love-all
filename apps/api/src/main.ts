import { NodeRuntime } from "@effect/platform-node";
import { Layer } from "effect";
import { HttpLive } from "./Http";

NodeRuntime.runMain(Layer.launch(HttpLive));
