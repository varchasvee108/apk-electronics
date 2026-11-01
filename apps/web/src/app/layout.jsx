import "./globals.css";
import "./learning.css";
import "./current-feedback.css";
import { WorkspaceProvider } from "@web/components/workspace";
import { Shell } from "@web/components/shell";

export const metadata = {
  title: {
    default: "Bench — Your electronics playground",
    template: "%s · Bench",
  },
  description:
    "Build circuits, explore electronics, and see your ideas come to life. A browser-native electronics lab powered by the Bench simulator.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <WorkspaceProvider>
          <Shell>{children}</Shell>
        </WorkspaceProvider>
      </body>
    </html>
  );
}
