-- The public footer line. Replaces the previous "Powering the Business Stack" line.
update site_content
set value = 'A private enterprise that builds, co-builds, grows, invests in and acquires profitable, scalable and sustainable businesses, as well as a diverse range of investment instruments and projects.',
    updated_at = now()
where site = 'boringpe' and key = 'footerTagline';
