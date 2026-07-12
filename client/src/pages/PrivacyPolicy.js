import React from 'react';

function PrivacyPolicy() {
  const [policyHtml, setPolicyHtml] = React.useState('');

  React.useEffect(() => {
    let isMounted = true;

    fetch('/privacy-policy.html')
      .then((response) => response.text())
      .then((html) => {
        if (isMounted) {
          setPolicyHtml(html);
        }
      })
      .catch(() => {
        if (isMounted) {
          setPolicyHtml('<h1>Privacy Policy</h1><p>Unable to load policy content.</p>');
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto bg-white shadow-sm border border-slate-200 rounded-2xl p-6 sm:p-10">
        <div dangerouslySetInnerHTML={{ __html: policyHtml }} />
      </div>
    </div>
  );
}

export default PrivacyPolicy;