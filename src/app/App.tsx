import React from "react";
import { IvResearchPage } from "../features/iv-research/IvResearchPage";
import { HomePage } from "../features/home/HomePage";

type Route = "/" | "/research/iv";

function getRouteFromHash(hash: string): Route {
  const normalized = hash.replace(/^#/, "").replace(/\/+$/, "");
  return normalized === "" ? "/" : (normalized as Route);
}

export function App() {
  const [route, setRoute] = React.useState<Route>(() => getRouteFromHash(window.location.hash));

  React.useEffect(() => {
    const onHashChange = () => setRoute(getRouteFromHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (route === "/research/iv") {
    return <IvResearchPage />;
  }

  return <HomePage />;
}
