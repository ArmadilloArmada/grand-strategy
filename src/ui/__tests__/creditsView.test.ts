import { describe, expect, it } from 'vitest';
import { buildCreditsHtml } from '../creditsView';

describe('buildCreditsHtml', () => {
  it('includes the title, author, and a close button', () => {
    const html = buildCreditsHtml();
    expect(html).toContain('GRAND STRATEGY');
    expect(html).toContain('ArmadilloArmada');
    expect(html).toContain('id="btn-close-credits"');
  });

  it('lists the tech stack and inspirations', () => {
    const html = buildCreditsHtml();
    expect(html).toContain('Electron');
    expect(html).toContain('TypeScript');
    expect(html).toContain('TripleA');
  });
});
