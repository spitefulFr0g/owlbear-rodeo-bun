import { ThemeProvider } from "theme-ui";
import { BrowserRouter as Router, Switch, Route } from "react-router-dom";

import theme from "./theme";
import Home from "./routes/Home";
import Game from "./routes/Game";
import Display from "./routes/Display";
import About from "./routes/About";
import FAQ from "./routes/FAQ";
import ReleaseNotes from "./routes/ReleaseNotes";
import HowTo from "./routes/HowTo";
import Setup from "./routes/Setup";

import { AuthProvider } from "./contexts/AuthContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { KeyboardProvider } from "./contexts/KeyboardContext";
import { DatabaseProvider } from "./contexts/DatabaseContext";
import { UserIdProvider } from "./contexts/UserIdContext";
import {
  ServerStatusProvider,
  useServerStatus,
} from "./contexts/ServerStatusContext";

import { ToastProvider } from "./components/Toast";
import LoadingOverlay from "./components/LoadingOverlay";

function Routes() {
  const { setup, offline } = useServerStatus();

  // A server that cannot be reached is left to each page to report
  if (setup === undefined && !offline) {
    return <LoadingOverlay bg="background" />;
  }

  // Nothing else can be used until the server has an administrator
  if (setup === "required") {
    return <Setup />;
  }

  return (
    <Router>
      <Switch>
        <Route path="/how-to">
          <HowTo />
        </Route>
        <Route path="/release-notes">
          <ReleaseNotes />
        </Route>
        <Route path="/about">
          <About />
        </Route>
        <Route path="/faq">
          <FAQ />
        </Route>
        <Route path="/game/:id">
          <DatabaseProvider>
            <UserIdProvider>
              <Game />
            </UserIdProvider>
          </DatabaseProvider>
        </Route>
        <Route path="/display/:id">
          <DatabaseProvider>
            <Display />
          </DatabaseProvider>
        </Route>
        <Route path="/">
          <Home />
        </Route>
      </Switch>
    </Router>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <SettingsProvider>
        <AuthProvider>
          <KeyboardProvider>
            <ToastProvider>
              <ServerStatusProvider>
                <Routes />
              </ServerStatusProvider>
            </ToastProvider>
          </KeyboardProvider>
        </AuthProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}

export default App;
