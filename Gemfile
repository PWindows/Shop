source "https://rubygems.org"

platform :windows do
  gem 'wdm', '>= 0.1.0'
end

if ENV['GITHUB_ACTIONS'] == 'true'
  gem "pwindows-theme", git: "https://#{ENV['GITHUB_TOKEN']}@github.com/PWindows/Website-Common.git"
else
  gem "pwindows-theme", git: "https://github.com/PWindows/Website-Common.git"
end

gem "jekyll", "~> 4.4"
gem "webrick"

group :jekyll_plugins do
  gem "jekyll-polyglot"
end

gem "html-proofer", "~> 5.0"
gem "nokogiri", "~> 1.19"
