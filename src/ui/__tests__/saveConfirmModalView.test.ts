import { describe, expect, it } from 'vitest';
import { buildSaveConfirmModalHtml } from '../saveConfirmModalView';

describe('buildSaveConfirmModalHtml', () => {
  it('includes the prompt and all three action buttons', () => {
    const html = buildSaveConfirmModalHtml();
    expect(html).toContain('Save Current Game?');
    expect(html).toContain('id="btn-save-and-continue"');
    expect(html).toContain('id="btn-discard-game"');
    expect(html).toContain('id="btn-cancel-leave"');
  });
});
