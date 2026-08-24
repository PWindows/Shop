# frozen_string_literal: true

require "json"
require "nokogiri"
require "set"
require "uri"
require "yaml"

ROOT = File.expand_path("..", __dir__)
DESTINATION = File.expand_path(ARGV.fetch(0, "_site"), ROOT)
CONFIG = YAML.safe_load_file(File.join(ROOT, "_config.yml"))
LANGUAGES = CONFIG.fetch("languages")
DEFAULT_LANG = CONFIG.fetch("default_lang")
SITE_URL = CONFIG.fetch("url").delete_suffix("/")
SITE_META = YAML.safe_load_file(File.join(ROOT, "_data", "site_meta.yml"))
RTL_LANGUAGES = Set.new(%w[ar-sa he-il]).freeze
TRANSLATED_SHOP_LANGUAGES = Set.new(%w[en-us zh-cn ja-jp]).freeze
PRODUCT_IDS = Dir[File.join(ROOT, "_products", "*.md")].filter_map do |path|
  next if File.basename(path) == "undefined.md"

  metadata = YAML.safe_load(File.read(path).match(/\A---\s*\n(.*?)\n---/m)[1], aliases: true)
  metadata["product_id"] if metadata["coins"] && metadata["category"]
end.freeze
PUBLIC_ROUTES = ["/", "/products/", "/404.html", *PRODUCT_IDS.map { |id| "/products/#{id}" }].freeze
ROUTE_IDS = { "/" => "shop-home", "/products/" => "shop-products", "/404.html" => "shop-not-found" }.freeze

def localized_route(route, language)
  return route if language == DEFAULT_LANG

  "/#{language}#{route == '/' ? '/' : route}"
end

def output_path(route)
  path = route.delete_prefix("/")
  relative = if path.empty?
               "index.html"
             elsif path.end_with?("/")
               File.join(path, "index.html")
             elsif File.extname(path).empty?
               "#{path}.html"
             else
               path
             end
  File.join(DESTINATION, relative)
end

errors = []
errors << "default_lang must be first and included" unless LANGUAGES.first == DEFAULT_LANG && LANGUAGES.include?(DEFAULT_LANG)
errors << "sitemap.xml must be excluded from localization" unless CONFIG.fetch("exclude_from_localization", []).include?("sitemap.xml")
errors << "robots.txt must be excluded from localization" unless CONFIG.fetch("exclude_from_localization", []).include?("robots.txt")

LANGUAGES.each do |language|
  PUBLIC_ROUTES.each do |base_route|
    route = localized_route(base_route, language)
    file = output_path(route)
    unless File.file?(file)
      errors << "Missing generated route #{route}"
      next
    end

    document = Nokogiri::HTML5(File.read(file))
    html = document.at_css("html")
    expected_direction = RTL_LANGUAGES.include?(language) ? "rtl" : "ltr"
    errors << "#{route} has incorrect lang" unless html&.[]("lang") == language
    errors << "#{route} has incorrect dir" unless html&.[]("dir") == expected_direction
    errors << "#{route} must contain one h1" unless document.css("main h1").length == 1
    errors << "#{route} has empty main content" if document.at_css("main")&.text.to_s.strip.empty?
    errors << "#{route} is missing a description" if document.at_css('meta[name="description"]')&.[]("content").to_s.strip.empty?
    expected_canonical = "#{SITE_URL}#{route == '/' ? '/' : route}"
    canonicals = document.css('link[rel="canonical"]')
    errors << "#{route} must contain exactly one canonical" unless canonicals.length == 1
    canonical = canonicals.first&.[]("href")
    errors << "#{route} canonical is #{canonical.inspect}" unless canonical == expected_canonical

    expected_alternates = LANGUAGES.to_h do |alternate_language|
      alternate_route = localized_route(base_route, alternate_language)
      [alternate_language, "#{SITE_URL}#{alternate_route == '/' ? '/' : alternate_route}"]
    end
    expected_alternates["x-default"] = "#{SITE_URL}#{base_route == '/' ? '/' : base_route}"
    alternates = document.css('link[rel="alternate"][hreflang]').group_by { |node| node["hreflang"] }
    expected_alternates.each do |alternate_language, expected_url|
      nodes = alternates.fetch(alternate_language, [])
      errors << "#{route} must contain exactly one #{alternate_language} alternate" unless nodes.length == 1
      if nodes.first && nodes.first["href"] != expected_url
        errors << "#{route} has an incorrect #{alternate_language} alternate"
      end
    end
    unexpected_alternates = alternates.keys.compact - expected_alternates.keys
    errors << "#{route} has unsupported alternates: #{unexpected_alternates.join(', ')}" unless unexpected_alternates.empty?

    route_id = ROUTE_IDS[base_route]
    localized_meta = SITE_META[language] || SITE_META[DEFAULT_LANG]
    expected_description = localized_meta.dig("descriptions", route_id) if route_id
    actual_description = document.at_css('meta[name="description"]')&.[]("content")
    if expected_description && actual_description != expected_description
      errors << "#{route} does not use its localized Shop description"
    end

    schemas = document.css('script[type="application/ld+json"]').filter_map do |node|
      JSON.parse(node.text)
    rescue JSON::ParserError => error
      errors << "#{route} has invalid JSON-LD: #{error.message}"
      nil
    end
    errors << "#{route} is missing OnlineStore schema" unless schemas.any? { |schema| schema["@type"] == "OnlineStore" }

    if base_route != "/products/" && base_route.start_with?("/products/")
      product_schema = schemas.find { |schema| schema["@type"] == "Product" }
      errors << "#{route} is missing Product identity schema" unless product_schema
      if product_schema
        errors << "#{route} Product schema URL is not locale-correct" unless product_schema["url"] == expected_canonical
        errors << "#{route} must not advertise offers before checkout launch" if product_schema.key?("offers")
        errors << "#{route} must not claim PreOrder availability" if product_schema.to_json.include?("PreOrder")
      end
      expected_social_image = "#{SITE_URL}/assets/img/products/#{File.basename(base_route)}.png"
      social_image = document.at_css('meta[property="og:image"]')&.[]("content")
      errors << "#{route} has an incorrect product social image" unless social_image == expected_social_image
    end

    if base_route == "/404.html"
      robots = document.at_css('meta[name="robots"]')&.[]("content").to_s.downcase.delete(" ")
      errors << "#{route} must be noindex,follow" unless robots == "noindex,follow"
    end

    document.css("img").each do |image|
      unless image["width"]&.match?(/\A\d+\z/) && image["height"]&.match?(/\A\d+\z/)
        errors << "#{route} image #{image['src'].inspect} lacks intrinsic dimensions"
      end
    end

    needs_fallback = language != DEFAULT_LANG && (
      !TRANSLATED_SHOP_LANGUAGES.include?(language) || base_route.start_with?("/products")
    )
    if needs_fallback && !document.at_css("[data-english-fallback]")
      errors << "#{route} is missing an English fallback notice"
    end
  end
end

LANGUAGES.each do |language|
  route = localized_route("/products/undefined", language)
  file = output_path(route)
  unless File.file?(file)
    errors << "Missing undefined placeholder route #{route}"
    next
  end
  document = Nokogiri::HTML5(File.read(file))
  robots = document.at_css('meta[name="robots"]')&.[]("content").to_s.downcase.delete(" ")
  errors << "#{route} placeholder must be noindex,follow" unless robots == "noindex,follow"
end

default_home = Nokogiri::HTML5(File.read(output_path("/")))
language_options = default_home.css("[data-language-select] option").map { |option| option["lang"] }
errors << "Language selector does not match configured languages" unless language_options == LANGUAGES

sitemap_path = File.join(DESTINATION, "sitemap.xml")
if File.file?(sitemap_path)
  sitemap = Nokogiri::XML(File.read(sitemap_path))
  locations = sitemap.xpath("//*[local-name()='loc']").map { |node| URI(node.text).path }
  expected = LANGUAGES.each_with_object(Set.new) do |language, values|
    (PUBLIC_ROUTES - ["/404.html"]).each { |route| values << localized_route(route, language) }
  end
  errors << "Shop sitemap contains duplicate URLs" unless locations.length == locations.uniq.length
  errors << "Shop sitemap URLs do not match public routes" unless locations.to_set == expected
  errors << "Placeholder product was included in sitemap" if locations.any? { |path| path.end_with?("/products/undefined") }
else
  errors << "Missing sitemap.xml"
end

manifest_path = File.join(DESTINATION, "assets", "manifest.json")
if File.file?(manifest_path)
  manifest_text = File.read(manifest_path)
  errors << "Manifest contains unresolved Liquid" if manifest_text.include?("{{") || manifest_text.include?("{%")
  begin
    manifest = JSON.parse(manifest_text)
    errors << "Manifest start_url must be /" unless manifest["start_url"] == "/"
  rescue JSON::ParserError => error
    errors << "Manifest is invalid: #{error.message}"
  end
else
  errors << "Missing Shop manifest"
end

%w[assets/extra tools tests README.md favicon.ico favicon-16x16.png favicon-32x32.png apple-touch-icon.png android-chrome-192x192.png android-chrome-512x512.png].each do |relative|
  errors << "Excluded file was published: #{relative}" if File.exist?(File.join(DESTINATION, relative))
end

text_extensions = Set.new(%w[.css .html .js .json .md .txt .xml])
Dir.glob(File.join(DESTINATION, "**", "*")).select { |path| File.file?(path) && text_extensions.include?(File.extname(path)) }.each do |path|
  content = File.read(path)

  relative = path.delete_prefix("#{DESTINATION}/")
  errors << "Unresolved Liquid in #{relative}" if content.include?("{{") || content.include?("{%")
  errors << "Conflict marker in #{relative}" if content.match?(/^(?:<<<<<<<|=======|>>>>>>>)/)
end

site_data = YAML.safe_load_file(File.join(ROOT, "_data", "site.yml"))
errors << "Main Website URL is not canonical" unless site_data["main_url"] == "https://www.pwindows.qzz.io"
errors << "Support must use the Discord fallback" unless site_data.dig("links", "support") == site_data.dig("links", "discord")
errors << "Checkout placeholder changed" unless site_data["checkout_endpoint"] == "https://your-worker.example.com/create-checkout"
errors << "Checkout launch state must remain false" unless site_data["checkout_ready"] == false
footer_game = site_data.fetch("footer_sections").flat_map { |section| Array(section["links"]) }.find { |item| item["translation_key"] == "sacred-remains" }
errors << "Shop footer must link to Sacred Remains" unless footer_game&.[]("path") == "/games/sacred-remains"
if site_data.to_s.include?("sacred-cubes") || site_data.to_s.include?("Sacred Cubes")
  errors << "Shop site data still references Sacred Cubes"
end

product_ids = []
Dir[File.join(ROOT, "_products", "*.md")].each do |path|
  source = File.read(path)
  metadata = YAML.safe_load(source.match(/\A---\s*\n(.*?)\n---/m)[1], aliases: true)
  if File.basename(path) == "undefined.md"
    errors << "Undefined placeholder product changed identity" unless metadata["title"] == "undefined"
    errors << "Undefined placeholder must be noindex,follow" unless metadata["robots"].to_s.delete(" ") == "noindex,follow"
    next
  end
  %w[product_id title coins category image price_usd price_myr price_cny stripe_price_id].each do |field|
    errors << "#{File.basename(path)} is missing #{field}" if metadata[field].nil?
  end
  errors << "#{File.basename(path)} placeholder Stripe ID changed" unless metadata["stripe_price_id"] == "price_PLACEHOLDER"
  product_ids << metadata["product_id"]
  image = metadata["image"].to_s.delete_prefix("/")
  errors << "#{File.basename(path)} image is missing" unless File.file?(File.join(ROOT, image))
end
errors << "Product IDs must be unique" unless product_ids.length == product_ids.uniq.length

javascript = File.read(File.join(ROOT, "assets", "js", "extra.js"))
errors << "Shop still sends IP data to ipapi" if javascript.include?("ipapi.co")
errors << "Checkout JavaScript still sends Stripe IDs" if javascript.include?("stripe_price_id")
errors << "Checkout JavaScript still sends client prices" if javascript.match?(/\bamount:\s*getItemPrice/)
errors << "Cart background is not made inert" unless javascript.include?("setCartBackgroundInert")
errors << "Cart focus restoration is missing" unless javascript.include?("restoreCartFocus")
errors << "Local development bypass is missing" unless javascript.include?("DEV_BYPASS_STORAGE_KEY") && javascript.include?("isLocalDevelopmentHost")
errors << "Development bypass must use session storage" unless javascript.include?("storage: sessionStorage")
errors << "Development bypass notice handling is missing" unless javascript.include?("developmentNotice.hidden = !developmentBypass")
errors << "Player redirect allowlist is missing" unless javascript.include?("safeShopRedirect") && javascript.include?("url.origin !== origin")
errors << "Missing-player checkout guard is missing" unless javascript.include?("checkout_requires_player")
errors << "Broken commented player guard remains" if javascript.include?("/*if (!player)")

css = File.read(File.join(ROOT, "assets", "css", "extra.css"))
required_css = [
  "#main-content {\n  padding-top: var(--topbar-height);",
  ".product-page-wrap {\n  padding: 16px 0 92px;",
  "@media (max-width: 700px)",
  "@media (max-width: 540px)",
  "@media (max-width: 420px)",
  "@media (max-width: 768px)",
  "@media (max-width: 980px)",
  "@media (max-height: 650px)",
  "grid-template-columns: 1fr;",
  "min-height: 0;",
  "overflow-wrap: anywhere;",
  "[dir=\"rtl\"] .back-link::before"
]
missing_css = required_css.reject { |assertion| css.include?(assertion) }
errors << "Missing Shop responsive/RTL CSS: #{missing_css.join(', ')}" unless missing_css.empty?
mobile_css = css[/@media \(max-width: 700px\).*?(?=\n@media|\z)/m].to_s
mobile_pill = mobile_css[/\.shop-user-pill\s*\{.*?\}/m].to_s
unless mobile_pill.include?("inset-inline: 0") && mobile_pill.include?("transform: none") && !mobile_pill.include?("translateX")
  errors << "Mobile player pill still uses direction-dependent centering"
end

gate_source = File.read(File.join(ROOT, "index.html"))
unless gate_source.include?('class="gate-logo"') && gate_source.include?('width="1452" height="64"')
  errors << "Accepted 1452x64 gate-logo compatibility declaration changed"
end

schema_source = File.read(File.join(ROOT, "_includes", "schema-org.html"))
errors << "Product offers are not guarded by checkout_ready" unless schema_source.include?("site.data.site.checkout_ready")
errors << "Product schema still claims PreOrder" if schema_source.include?("PreOrder")

header_source = File.read(File.join(ROOT, "_includes", "header.html"))
errors << "Local development notice markup is missing" unless header_source.include?('id="development-notice"')

test_source = File.read(File.join(ROOT, "tests", "shop-js-test.js"))
errors << "Full DOM initialization smoke test is missing" unless test_source.include?("initializeShop") && test_source.include?("assert.doesNotThrow")
errors << "Production-host bypass isolation test is missing" unless test_source.include?("shop.pwindows.qzz.io") && test_source.include?("dev-bypass=1")
errors << "Redirect backslash attack test is missing" unless test_source.include?('safeShopRedirect("/\\\\evil.example/products"')

theme_revision = "195c156f79457b6761e8e0c1ec00161bfe5e5a2c"
gemfile = File.read(File.join(ROOT, "Gemfile"))
lockfile = File.read(File.join(ROOT, "Gemfile.lock"))
errors << "Gemfile must pin the exact shared-theme commit" unless gemfile.include?(%{ref: "#{theme_revision}"})
errors << "Gemfile.lock must pin the exact shared-theme commit" unless lockfile.include?("revision: #{theme_revision}")

Dir[File.join(ROOT, ".github", "workflows", "*.yml")].each do |path|
  workflow = File.read(path)
  errors << "#{File.basename(path)} must use Ruby 3.4.10" unless workflow.include?("3.4.10")
  errors << "#{File.basename(path)} must not target redesign" if workflow.match?(/branches:\s*\[[^\]]*redesign/)
  errors << "#{File.basename(path)} must run Shop JavaScript tests" unless workflow.include?("node tests/shop-js-test.js")
end

main_site_links = default_home.css(%{a[href^="https://www.pwindows.qzz.io"]}).map { |node| node["href"] }
errors << "Shop is missing the canonical main Website cross-link" if main_site_links.empty?
errors << "Shop is missing the Sacred Remains cross-link" unless main_site_links.any? { |href| href.end_with?("/games/sacred-remains") }

if errors.empty?
  puts "Shop verification passed."
else
  warn errors.map { |error| "- #{error}" }.join("\n")
  exit 1
end
