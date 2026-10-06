import { parseLinkedInAlertHtml } from './linkedin-email.parser';

const html = `
<html><body>
<table><tr><td>
  <a href="https://www.linkedin.com/comm/jobs/view/3912345678?trk=eml-job_alerts&amp;refId=abc">
    Senior Node.js Engineer
  </a>
  <p>Acme Corp · Yerevan, Armenia</p>
  <p>2 days ago</p>
  <a href="https://www.linkedin.com/comm/jobs/view/3912345678?trk=eml-job_alerts">View job</a>
</td></tr>
<tr><td>
  <a href="https://www.linkedin.com/comm/jobs/view/senior-backend-nestjs-at-globex-3999999999?trk=x">
    Backend Developer (NestJS)
  </a>
  <p>Globex</p>
  <p>Remote</p>
</td></tr></table>
</body></html>`;

describe('parseLinkedInAlertHtml', () => {
  it('extracts jobs, normalizes urls and skips button links', () => {
    const jobs = parseLinkedInAlertHtml(html, new Date('2026-10-06'));
    expect(jobs).toHaveLength(2);

    expect(jobs[0]).toMatchObject({
      id: 'linkedin:3912345678',
      title: 'Senior Node.js Engineer',
      company: 'Acme Corp',
      location: 'Yerevan, Armenia',
      url: 'https://www.linkedin.com/jobs/view/3912345678',
    });

    expect(jobs[1]).toMatchObject({
      id: 'linkedin:3999999999',
      title: 'Backend Developer (NestJS)',
      company: 'Globex',
      location: 'Remote',
      remote: true,
    });
  });

  it('returns an empty list for unrelated html', () => {
    expect(parseLinkedInAlertHtml('<p>hello</p>')).toEqual([]);
  });
});
