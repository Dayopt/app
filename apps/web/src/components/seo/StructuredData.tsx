import { generateStructuredData } from '@/platform/seo/metadata';

type StructuredDataValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | StructuredDataValue[]
  | { [key: string]: StructuredDataValue };

/**
 * Component for rendering structured data
 */
export function StructuredData({
  type,
  data,
}: {
  type: string;
  data: Record<string, StructuredDataValue>;
}) {
  const structuredData = generateStructuredData(type, data);

  if (!structuredData) return null;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(structuredData),
      }}
    />
  );
}

export default StructuredData;
