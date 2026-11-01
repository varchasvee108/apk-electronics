import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty-state">
      <span className="eyebrow">404 · OPEN CIRCUIT</span>
      <h1>This connection goes nowhere.</h1>
      <p>Head back to your workspace and make something great.</p>
      <Link className="button primary" href="/">
        Back to workspace
      </Link>
    </div>
  );
}
