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
RTL_LANGUAGES = Set.new(%w[ar-sa he-il]).freeze
TRANSLATED_SHOP_LANGUAGES = Set.new(%w[en-us zh-cn ja-jp]).freeze
PRODUCT_IDS = Dir[File.join(ROOT, "_products", "*.md")].filter_map do |path|
  next if File.basename(path) == "undefined.md"

  metadata = YAML.safe_load(File.read(path).match(/\A---\s*\n(.*?)\n---/m)[1], aliases: true)
  metadata["product_id"] if metadata["coins"] && metadata["category"]
end.freeze
PUBLIC_ROUTES = ["/", "/products/", "/404.html", *PRODUCT_IDS.map { |id| "/products/#{id}" }].freeze

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
    canonical = document.at_css('link[rel="canonical"]')&.[]("href")
    errors << "#{route} canonical is #{canonical.inspect}" unless canonical == expected_canonical

    document.css('script[type="application/ld+json"]').each do |node|
      JSON.parse(node.text)
    rescue JSON::ParserError => error
      errors << "#{route} has invalid JSON-LD: #{error.message}"
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

%w[assets/extra tools README.md favicon.ico favicon-16x16.png favicon-32x32.png apple-touch-icon.png android-chrome-192x192.png android-chrome-512x512.png].each do |relative|
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

product_ids = []
Dir[File.join(ROOT, "_products", "*.md")].each do |path|
  source = File.read(path)
  metadata = YAML.safe_load(source.match(/\A---\s*\n(.*?)\n---/m)[1], aliases: true)
  if File.basename(path) == "undefined.md"
    errors << "Undefined placeholder product changed identity" unless metadata["title"] == "undefined"
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

if errors.empty?
  puts "Shop verification passed."
else
  warn errors.map { |error| "- #{error}" }.join("\n")
  exit 1
end
