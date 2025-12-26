'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { ComponentPropsWithoutRef } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`markdown-content prose prose-invert max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Custom styling for code blocks
          pre: ({ children, ...props }: ComponentPropsWithoutRef<'pre'>) => (
            <pre
              className="bg-gray-900 border border-gray-700 rounded-lg p-4 overflow-x-auto text-sm"
              {...props}
            >
              {children}
            </pre>
          ),
          code: ({ className, children, ...props }: ComponentPropsWithoutRef<'code'>) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code
                  className="bg-gray-800 text-orange-300 px-1.5 py-0.5 rounded text-sm font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          // Tables with proper styling
          table: ({ children, ...props }: ComponentPropsWithoutRef<'table'>) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border-collapse border border-gray-700" {...props}>
                {children}
              </table>
            </div>
          ),
          th: ({ children, ...props }: ComponentPropsWithoutRef<'th'>) => (
            <th
              className="border border-gray-700 bg-gray-800 px-4 py-2 text-left font-semibold"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }: ComponentPropsWithoutRef<'td'>) => (
            <td className="border border-gray-700 px-4 py-2" {...props}>
              {children}
            </td>
          ),
          // Links
          a: ({ children, href, ...props }: ComponentPropsWithoutRef<'a'>) => (
            <a
              href={href}
              className="text-blue-400 hover:text-blue-300 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            >
              {children}
            </a>
          ),
          // Lists
          ul: ({ children, ...props }: ComponentPropsWithoutRef<'ul'>) => (
            <ul className="list-disc list-inside space-y-1 my-2" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }: ComponentPropsWithoutRef<'ol'>) => (
            <ol className="list-decimal list-inside space-y-1 my-2" {...props}>
              {children}
            </ol>
          ),
          // Blockquotes
          blockquote: ({ children, ...props }: ComponentPropsWithoutRef<'blockquote'>) => (
            <blockquote
              className="border-l-4 border-gray-600 pl-4 italic text-gray-400 my-4"
              {...props}
            >
              {children}
            </blockquote>
          ),
          // Headers
          h1: ({ children, ...props }: ComponentPropsWithoutRef<'h1'>) => (
            <h1 className="text-2xl font-bold mt-6 mb-4 text-gray-100" {...props}>
              {children}
            </h1>
          ),
          h2: ({ children, ...props }: ComponentPropsWithoutRef<'h2'>) => (
            <h2 className="text-xl font-bold mt-5 mb-3 text-gray-100" {...props}>
              {children}
            </h2>
          ),
          h3: ({ children, ...props }: ComponentPropsWithoutRef<'h3'>) => (
            <h3 className="text-lg font-bold mt-4 mb-2 text-gray-100" {...props}>
              {children}
            </h3>
          ),
          // Paragraphs
          p: ({ children, ...props }: ComponentPropsWithoutRef<'p'>) => (
            <p className="my-2 leading-relaxed" {...props}>
              {children}
            </p>
          ),
          // Horizontal rule
          hr: (props: ComponentPropsWithoutRef<'hr'>) => (
            <hr className="border-gray-700 my-6" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
