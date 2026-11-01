"use client";
export default function ErrorPage({ reset }) {
  return (
    <div className="empty-state">
      <h1>Let’s get you back to the bench.</h1>
      <p>
        Something went wrong loading this page. Your saved circuits are still in
        your browser.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
