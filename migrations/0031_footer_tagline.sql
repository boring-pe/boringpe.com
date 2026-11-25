update site_content
set value = 'A private enterprise that builds, co-builds, grows, invests in and acquires profitable, scalable and sustainable businesses, commercial projects and investable assets.',
    updated_at = now()
where site = 'boringpe' and key = 'footerTagline';
