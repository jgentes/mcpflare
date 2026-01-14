import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <div className="flex items-center gap-2">
        <img src="/mcpflare/icon.svg" alt="MCPflare" className="h-6 w-6" />
        <span className="font-bold">MCPflare</span>
      </div>
    ),
  },
  links: [
    {
      text: 'Documentation',
      url: '/docs',
      active: 'nested-url',
    },
    {
      text: 'GitHub',
      url: 'https://github.com/jgentes/mcpflare',
      external: true,
    },
  ],
  githubUrl: 'https://github.com/jgentes/mcpflare',
};



