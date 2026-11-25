update site_content
set value = 'A private enterprise that builds, co-builds, grows, invests in and acquires profitable, scalable and sustainable businesses, and investable and commercial projects.',
    updated_at = now()
where site = 'boringpe' and key = 'footerTagline';
