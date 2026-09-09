from setuptools import setup
package_name = 'drone_monitor'
setup(name=package_name, version='0.1.0', packages=[package_name], data_files=[('share/ament_index/resource_index/packages',['resource/'+package_name]),('share/'+package_name,['package.xml'])], install_requires=['setuptools'], zip_safe=True, maintainer='Drone Platform', maintainer_email='dev@localhost', description='PX4 telemetry monitor', license='Apache-2.0', entry_points={'console_scripts':['monitor = drone_monitor.monitor:main']})
