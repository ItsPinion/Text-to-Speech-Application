import '@testing-library/jest-dom/vitest';

// jsdom has no blob-URL implementation — stub what App uses.
// (Assigned on the URL constructor so tests can also assert on calls.)
URL.createObjectURL = vi.fn(() => 'blob:mock-audio');
URL.revokeObjectURL = vi.fn();
