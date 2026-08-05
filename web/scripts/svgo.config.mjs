export default {
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          removeUnknownsAndDefaults: false,
        },
      },
    },
    {
      name: 'replace-fill-stroke',
      type: 'visitor',
      fn: () => ({
        element: {
          enter: (node) => {
            const attrs = node.attributes;

            if (attrs.fill && attrs.fill !== 'none') {
              attrs.fill = 'currentColor';
            }
            if (attrs.stroke && attrs.stroke !== 'none') {
              attrs.stroke = 'currentColor';
            }

            if (attrs.style) {
              attrs.style = attrs.style
                .replace(/fill\s*:\s*#[0-9a-fA-F]{3,6}/gi, 'fill:currentColor')
                .replace(/stroke\s*:\s*#[0-9a-fA-F]{3,6}/gi, 'stroke:currentColor');
            }
          },
        },
      }),
    },
    {
      name: 'replace-style-tag-colors',
      type: 'visitor',
      fn: () => ({
        element: {
          enter: (node) => {
            if (node.name === 'style' && node.children?.[0]?.value) {
              node.children[0].value = node.children[0].value
                .replace(/stroke\s*:\s*#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})/gi, 'stroke:currentColor')
                .replace(/fill\s*:\s*#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})/gi, 'fill:currentColor');
            }
          },
        },
      }),
    },
  ],
};
