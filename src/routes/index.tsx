import { createFileRoute } from "@tanstack/react-router";
import { CosmicWorldApp } from "@/components/cosmic-app";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <CosmicWorldApp />;
}
